// The writing itself — pieces by the writers in lib/writers.ts, entered
// manually in v1 (admin curation). Raw-SQL data layer over `articles` and the
// polymorphic `article_entities` cross-link (migration 0063).
//
// Each article ALWAYS links out to the original (url); we store a hand-picked,
// attributed pull_quote plus an embed/OG card so /reads renders editorially
// rather than as a list of links. article_entities ties a piece to the
// bands/shows/venues/musicians it's about, which is what surfaces "In the
// press" on those profiles (listArticlesForEntity).

import { sql } from "./db.ts";
import type postgres from "postgres";
import { extractOgImage } from "./ogImage.ts";
import type { ArticleEntityType } from "./writerUtils.ts";

// Mirrors the `articles` columns exactly (snake_case).
export interface Article {
  id: number;
  writer_id: number;
  url: string;
  canonical_url: string | null;
  title: string;
  publication: string | null;
  dek: string | null;
  pull_quote: string | null;
  hero_image_url: string | null;
  embed_html: string | null;
  published_at: string | null;
  reading_time: number | null;
  featured: boolean;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
}

// An article joined with the bits of its writer a card needs to render.
export interface ArticleWithWriter extends Article {
  writer_slug: string;
  writer_name: string;
  writer_photo: string | null;
  writer_thumbnail_url: string | null;
}

export interface ArticleEntityLink {
  entity_type: ArticleEntityType;
  entity_id: string;
}

const WRITER_COLS = sql`
  articles.*,
  writers.slug as writer_slug,
  writers.name as writer_name,
  writers.photo as writer_photo,
  writers.thumbnail_url as writer_thumbnail_url
`;

// The public /reads feed: published pieces, newest first, featured pinned on
// top. `limit`/`onlyFeatured` support the hub's hero + grid split.
export async function listPublishedArticles(opts: {
  limit?: number;
  onlyFeatured?: boolean;
} = {}): Promise<ArticleWithWriter[]> {
  const { limit, onlyFeatured } = opts;
  return sql<ArticleWithWriter[]>`
    select ${WRITER_COLS}
    from articles
    join writers on writers.id = articles.writer_id
    where articles.status = 'published'
      ${onlyFeatured ? sql`and articles.featured` : sql``}
    order by articles.featured desc, articles.published_at desc nulls last, articles.created_at desc
    ${limit ? sql`limit ${limit}` : sql``}
  `;
}

export async function listArticlesByWriter(
  writerId: number,
  opts: { includeDrafts?: boolean } = {},
): Promise<ArticleWithWriter[]> {
  const { includeDrafts } = opts;
  return sql<ArticleWithWriter[]>`
    select ${WRITER_COLS}
    from articles
    join writers on writers.id = articles.writer_id
    where articles.writer_id = ${writerId}
      ${includeDrafts ? sql`` : sql`and articles.status = 'published'`}
    order by articles.published_at desc nulls last, articles.created_at desc
  `;
}

// "In the press" on a band/show/venue/musician page. entity_id is text in the
// DB (shows.id is uuid, the rest bigint — see migration 0063), so callers pass
// the id stringified.
export async function listArticlesForEntity(
  entityType: ArticleEntityType,
  entityId: string | number,
): Promise<ArticleWithWriter[]> {
  return sql<ArticleWithWriter[]>`
    select ${WRITER_COLS}
    from articles
    join writers on writers.id = articles.writer_id
    join article_entities ae on ae.article_id = articles.id
    where ae.entity_type = ${entityType}
      and ae.entity_id = ${String(entityId)}
      and articles.status = 'published'
    order by articles.published_at desc nulls last, articles.created_at desc
  `;
}

// Admin listing: every article incl. drafts, newest first, with writer bits
// for the table.
export async function listAllArticles(): Promise<ArticleWithWriter[]> {
  return sql<ArticleWithWriter[]>`
    select ${WRITER_COLS}
    from articles
    join writers on writers.id = articles.writer_id
    order by articles.featured desc, articles.published_at desc nulls last, articles.created_at desc
  `;
}

export async function getArticleById(id: number): Promise<Article | null> {
  const [row] = await sql<Article[]>`select * from articles where id = ${id} limit 1`;
  return row ?? null;
}

export async function getArticleEntities(articleId: number): Promise<ArticleEntityLink[]> {
  return sql<ArticleEntityLink[]>`
    select entity_type, entity_id from article_entities
    where article_id = ${articleId}
    order by entity_type, entity_id
  `;
}

// The band slugs currently cross-linked to an article, for prefilling the
// admin edit form's comma-separated band field. entity_id holds the band's
// numeric id as text (migration 0063), so we cast back to bigint to join.
export async function getArticleBandSlugs(articleId: number): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    select bands.slug
    from article_entities ae
    join bands on bands.id = ae.entity_id::bigint
    where ae.article_id = ${articleId} and ae.entity_type = 'band'
    order by bands.slug
  `;
  return rows.map((r) => r.slug);
}

export interface ArticleInput {
  writerId: number;
  url: string;
  title: string;
  publication: string;
  dek: string;
  pullQuote: string;
  heroImageUrl: string;
  embedHtml: string;
  publishedAt: string | null; // ISO date or null
  readingTime: number | null;
  featured: boolean;
  status: "draft" | "published";
  entities: ArticleEntityLink[]; // full desired set of cross-links, always sent
}

type Tx = postgres.TransactionSql;

async function replaceEntities(tx: Tx, articleId: number, entities: ArticleEntityLink[]): Promise<void> {
  await tx`delete from article_entities where article_id = ${articleId}`;
  for (const e of entities) {
    await tx`
      insert into article_entities (article_id, entity_type, entity_id)
      values (${articleId}, ${e.entity_type}, ${e.entity_id})
      on conflict (article_id, entity_type, entity_id) do nothing
    `;
  }
}

// Create (id omitted) or update (id given) an article and its full set of
// entity cross-links in one transaction, so the article and its tags can't
// drift apart. If heroImageUrl is blank we best-effort fetch og:image from the
// url (never fails the write — extractOgImage returns "" on any error).
export async function upsertArticle(input: ArticleInput, id?: number): Promise<Article> {
  let heroImageUrl = input.heroImageUrl.trim();
  if (!heroImageUrl) {
    heroImageUrl = await extractOgImage(input.url);
  }

  return sql.begin(async (tx) => {
    let article: Article;
    if (id) {
      const [updated] = await tx<Article[]>`
        update articles set
          writer_id = ${input.writerId},
          url = ${input.url},
          title = ${input.title},
          publication = ${input.publication || null},
          dek = ${input.dek || null},
          pull_quote = ${input.pullQuote || null},
          hero_image_url = ${heroImageUrl || null},
          embed_html = ${input.embedHtml || null},
          published_at = ${input.publishedAt},
          reading_time = ${input.readingTime},
          featured = ${input.featured},
          status = ${input.status},
          updated_at = now()
        where id = ${id}
        returning *
      `;
      article = updated;
    } else {
      const [created] = await tx<Article[]>`
        insert into articles (
          writer_id, url, title, publication, dek, pull_quote, hero_image_url,
          embed_html, published_at, reading_time, featured, status
        ) values (
          ${input.writerId}, ${input.url}, ${input.title}, ${input.publication || null},
          ${input.dek || null}, ${input.pullQuote || null}, ${heroImageUrl || null},
          ${input.embedHtml || null}, ${input.publishedAt}, ${input.readingTime},
          ${input.featured}, ${input.status}
        )
        returning *
      `;
      article = created;
    }

    await replaceEntities(tx, article.id, input.entities);
    return article;
  });
}

export async function deleteArticle(id: number): Promise<void> {
  await sql`delete from articles where id = ${id}`;
}
