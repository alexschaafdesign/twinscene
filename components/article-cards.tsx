// Shared editorial renderers for an article — the featured hero and the grid
// card — used by /reads and by a writer's profile (/writers/[slug]). Server-
// safe (no client hooks). Every clickable path links OUT to the original
// (article.url); the byline links to the writer's Twin Scene profile.

import Link from "next/link";
import type { ArticleWithWriter } from "@/lib/articles";
import { WriterAvatar } from "@/components/writer-shared";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ArticleMetaLine({ article }: { article: ArticleWithWriter }) {
  const bits = [
    article.publication,
    article.reading_time ? `${article.reading_time} min read` : null,
    formatDate(article.published_at),
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <div className="font-mono text-[11px] uppercase tracking-wider text-[#E8E0D0]/50">
      {bits.join("  ·  ")}
    </div>
  );
}

// The writer byline — avatar + name, linking to their profile. Hidden when the
// caller is already showing the writer (e.g. on that writer's own page).
export function ArticleByline({ article }: { article: ArticleWithWriter }) {
  return (
    <Link
      href={`/writers/${article.writer_slug}`}
      className="inline-flex items-center gap-2 text-[#E8E0D0]/80 transition hover:text-[#E8E0D0]"
    >
      <WriterAvatar
        writer={{
          name: article.writer_name,
          photo: article.writer_photo,
          thumbnail_url: article.writer_thumbnail_url,
        }}
        className="h-6 w-6 text-[10px]"
      />
      <span className="text-sm font-medium">{article.writer_name}</span>
    </Link>
  );
}

export function FeaturedHero({ article }: { article: ArticleWithWriter }) {
  return (
    <article className="grid gap-6 border-b border-[#E8E0D0]/15 pb-10 md:grid-cols-2 md:gap-10">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block overflow-hidden rounded-lg bg-[#E8E0D0]/5 ring-1 ring-[#E8E0D0]/10"
      >
        {article.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external OG images; next/image would need per-domain remotePatterns
          <img
            src={article.hero_image_url}
            alt=""
            className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="aspect-[16/10] w-full bg-gradient-to-br from-[#7c5e35]/30 to-[#090909]" />
        )}
      </a>

      <div className="flex flex-col justify-center gap-4">
        <ArticleMetaLine article={article} />
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="group">
          <h2 className="text-2xl font-semibold leading-tight text-[#E8E0D0] transition group-hover:text-white sm:text-3xl">
            {article.title}
          </h2>
        </a>
        {article.dek && <p className="text-[15px] leading-relaxed text-[#E8E0D0]/70">{article.dek}</p>}

        {article.pull_quote && (
          <blockquote className="border-l-2 border-[#7c5e35] pl-4 text-lg italic leading-snug text-[#E8E0D0]/90">
            &ldquo;{article.pull_quote}&rdquo;
          </blockquote>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <ArticleByline article={article} />
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            Read at {article.publication || "the source"} →
          </a>
        </div>
      </div>
    </article>
  );
}

export function ArticleCard({
  article,
  showByline = true,
}: {
  article: ArticleWithWriter;
  showByline?: boolean;
}) {
  return (
    <article className="group flex flex-col gap-3">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg bg-[#E8E0D0]/5 ring-1 ring-[#E8E0D0]/10"
      >
        {article.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.hero_image_url}
            alt=""
            className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-[16/10] w-full bg-gradient-to-br from-[#7c5e35]/25 to-[#090909]" />
        )}
      </a>
      <ArticleMetaLine article={article} />
      <a href={article.url} target="_blank" rel="noopener noreferrer">
        <h3 className="text-lg font-semibold leading-snug text-[#E8E0D0] transition group-hover:text-white">
          {article.title}
        </h3>
      </a>
      {article.pull_quote && (
        <blockquote className="border-l-2 border-[#7c5e35]/70 pl-3 text-sm italic leading-snug text-[#E8E0D0]/70">
          &ldquo;{article.pull_quote}&rdquo;
        </blockquote>
      )}
      {showByline && (
        <div className="mt-auto pt-1">
          <ArticleByline article={article} />
        </div>
      )}
    </article>
  );
}
