// Shared translation from the admin article form's JSON body into an
// ArticleInput (used by both the create POST and the update PATCH routes).
// Keeps validation + band-slug resolution in one place.

import type { ArticleInput, ArticleEntityLink } from "./articles.ts";
import { getBandBySlug } from "./bands.ts";

export interface ArticleBody {
  writerId?: number;
  url?: string;
  title?: string;
  publication?: string;
  dek?: string;
  pullQuote?: string;
  heroImageUrl?: string;
  embedHtml?: string;
  publishedAt?: string | null;
  readingTime?: number | null;
  featured?: boolean;
  status?: "draft" | "published";
  bandSlugs?: string; // comma-separated band slugs to cross-link
}

// Resolve comma-separated band slugs into article_entities links (entity_id is
// the band's numeric id, stored as text). Unknown slugs are skipped silently
// so one typo doesn't fail the whole save. v1 tags bands only — show/venue/
// musician tagging is a later slice.
async function resolveBandEntities(bandSlugsRaw: string): Promise<ArticleEntityLink[]> {
  const slugs = bandSlugsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const links: ArticleEntityLink[] = [];
  for (const slug of slugs) {
    const band = await getBandBySlug(slug);
    if (band) links.push({ entity_type: "band", entity_id: String(band.id) });
  }
  return links;
}

export async function buildArticleInput(body: ArticleBody): Promise<ArticleInput | { error: string }> {
  if (!body.writerId) return { error: "A writer is required" };
  if (!body.url?.trim()) return { error: "A URL is required" };
  if (!body.title?.trim()) return { error: "A title is required" };

  return {
    writerId: body.writerId,
    url: body.url.trim(),
    title: body.title.trim(),
    publication: body.publication?.trim() ?? "",
    dek: body.dek?.trim() ?? "",
    pullQuote: body.pullQuote?.trim() ?? "",
    heroImageUrl: body.heroImageUrl?.trim() ?? "",
    embedHtml: body.embedHtml?.trim() ?? "",
    publishedAt: body.publishedAt || null,
    readingTime: body.readingTime ?? null,
    featured: !!body.featured,
    status: body.status === "draft" ? "draft" : "published",
    entities: await resolveBandEntities(body.bandSlugs ?? ""),
  };
}
