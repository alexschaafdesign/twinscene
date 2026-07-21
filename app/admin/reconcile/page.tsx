import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { analyzeCrawlSpace, type ReconcileEntry } from "@/lib/scrapers/reconcile";

// Admin-only: scrapes Crawl Space live at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reconcile — Twin Scene",
  robots: { index: false, follow: false },
};

function GenreChips({ genres, age }: { genres: string[]; age: string | null }) {
  if (genres.length === 0 && !age) {
    return <span className="text-xs text-[#E8E0D0]/35">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {genres.map((g) => (
        <span
          key={g}
          className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[11px] text-[#E8E0D0]/80"
        >
          {g}
        </span>
      ))}
      {age && (
        <span className="rounded bg-[#E8B84B]/15 px-1.5 py-0.5 text-[11px] text-[#E8B84B]">
          {age}
        </span>
      )}
    </span>
  );
}

function bandsLabel(entry: ReconcileEntry): string {
  const bands = entry.allBands.join(", ");
  return entry.musicTime ? `${bands} · ${entry.musicTime}` : bands;
}

export default async function AdminReconcilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/reconcile");
  if (!isAdmin(user)) return <NotAdmin />;

  let report: Awaited<ReturnType<typeof analyzeCrawlSpace>> | null = null;
  let error = "";
  try {
    report = await analyzeCrawlSpace();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to read Crawl Space";
  }

  const unmatched = report?.entries.filter((e) => !e.match) ?? [];
  const matched = report?.entries.filter((e) => e.match) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <h1 className="text-2xl font-medium tracking-tight">Crawl Space reconcile</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">
        Tonight&apos;s complete list from Crawl Space, matched against our shows.
        Unmatched entries are ones they list that we don&apos;t have; matched
        ones get their genre/age suggested onto our show by the daily run
        (fill-only — it never overwrites a genre we already have).
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
          {error}
        </p>
      )}

      {report && (
        <>
          <p className="mt-4 text-sm text-[#E8E0D0]/60">
            {report.total} listed · {report.matched} on our list ·{" "}
            <span className="text-[#E8E0D0]">{report.unmatched} missing</span>
          </p>

          {/* Missing shows — the reconciliation signal. */}
          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/50">
              Missing from our list ({unmatched.length})
            </h2>
            {unmatched.length === 0 ? (
              <p className="mt-2 text-sm text-[#E8E0D0]/45">
                Nothing — we have everything Crawl Space listed tonight.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {unmatched.map((e, i) => (
                  <li
                    key={`${e.venue}-${i}`}
                    className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-3"
                  >
                    <p className="text-sm text-[#E8E0D0]">{e.venue}</p>
                    <p className="mt-0.5 text-sm text-[#E8E0D0]/70">{bandsLabel(e)}</p>
                    <div className="mt-1.5">
                      <GenreChips genres={e.genres} age={e.ageRestriction} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Matched — genre/age suggestions the daily run fills in. */}
          <section className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/50">
              Matched — genre/age suggestions ({matched.length})
            </h2>
            {matched.length === 0 ? (
              <p className="mt-2 text-sm text-[#E8E0D0]/45">No matches tonight.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {matched.map((e, i) => (
                  <li
                    key={`${e.match!.id}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E8E0D0]/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/shows/${e.match!.id}`}
                        className="text-sm text-[#E8E0D0] hover:underline"
                      >
                        {e.match!.title}
                      </Link>
                      <span className="ml-2 text-xs text-[#E8E0D0]/50">
                        {e.match!.venue}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <GenreChips genres={e.genres} age={e.ageRestriction} />
                      {e.match!.genres.length > 0 && (
                        <span className="text-[#E8E0D0]/35">already set</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
