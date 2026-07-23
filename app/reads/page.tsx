import Link from "next/link";
import type { Metadata } from "next";
import { listPublishedArticles } from "@/lib/articles";
import { FeaturedHero, ArticleCard } from "@/components/article-cards";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Reads — Twin Scene",
  description:
    "Writing about the Twin Cities music scene — reviews, interviews, and features from local music writers and journalists.",
});

// listPublishedArticles() reads the DB directly (no fetch()), so Next has no
// signal to render dynamically — without this the page caches after its first
// render and goes stale when an article is added/edited. Same note as
// /photo-video.
export const dynamic = "force-dynamic";

export default async function ReadsPage() {
  const articles = await listPublishedArticles();
  // The single most recent featured piece (or newest overall) leads; the rest
  // fill the grid. listPublishedArticles already sorts featured-first.
  const [hero, ...rest] = articles;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Reads</h1>
          <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
            Writing about the Twin Cities scene — reviews, interviews, and features from the people
            covering it.
          </p>
        </div>
        <nav className="flex items-center gap-5">
          <Link
            href="/playlists"
            className="font-mono text-xs uppercase tracking-wider text-[#E8E0D0]/70 underline-offset-4 transition hover:text-[#E8E0D0] hover:underline"
          >
            Playlists →
          </Link>
          <Link
            href="/writers"
            className="font-mono text-xs uppercase tracking-wider text-[#E8E0D0]/70 underline-offset-4 transition hover:text-[#E8E0D0] hover:underline"
          >
            The writers →
          </Link>
        </nav>
      </header>

      {articles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E8E0D0]/20 px-6 py-16 text-center text-[#E8E0D0]/50">
          No pieces yet — check back soon.
        </div>
      ) : (
        <>
          {hero && <FeaturedHero article={hero} />}
          {rest.length > 0 && (
            <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
