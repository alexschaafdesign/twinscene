// "In the press" — the cross-link payoff. Given the articles tagged to an
// entity (band/show/venue/musician) via article_entities, render a compact
// press list under that entity's profile. Server-safe. Renders nothing when
// there are no pieces, so callers can drop it in unconditionally.

import Link from "next/link";
import type { ArticleWithWriter } from "@/lib/articles";
import { WriterAvatar } from "@/components/writer-shared";

export default function EntityPress({
  articles,
  heading = "In the press",
}: {
  articles: ArticleWithWriter[];
  heading?: string;
}) {
  if (articles.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">{heading}</h2>
      <ul className="flex flex-col divide-y divide-[#E8E0D0]/10">
        {articles.map((a) => (
          <li key={a.id}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-4 py-3 transition"
            >
              {a.hero_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external OG images
                <img
                  src={a.hero_image_url}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded object-cover ring-1 ring-[#E8E0D0]/10"
                />
              ) : (
                <div className="h-16 w-24 shrink-0 rounded bg-gradient-to-br from-[#7c5e35]/25 to-[#090909]" />
              )}
              <div className="min-w-0">
                <div className="font-medium leading-snug text-[#E8E0D0] transition group-hover:text-white">
                  {a.title}
                </div>
                {a.pull_quote && (
                  <p className="mt-0.5 line-clamp-1 text-sm italic text-[#E8E0D0]/55">
                    &ldquo;{a.pull_quote}&rdquo;
                  </p>
                )}
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#E8E0D0]/45">
                  {[a.publication, a.writer_name].filter(Boolean).join("  ·  ")}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
      <Link
        href="/reads"
        className="mt-3 inline-block font-mono text-[11px] uppercase tracking-wider text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
      >
        More on Reads →
      </Link>
    </section>
  );
}
