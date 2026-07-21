import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { analyzeCrawlSpace } from "@/lib/scrapers/reconcile";
import ReconcileManager from "@/components/ReconcileManager";

// Admin-only: scrapes Crawl Space live at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reconcile — Twin Scene",
  robots: { index: false, follow: false },
};

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
        Add a missing one as a real show, dismiss it, or apply a genre/age
        suggestion now instead of waiting for the nightly run (which still
        applies suggestions automatically — this just lets you go faster or
        correct one first).
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

          <ReconcileManager initialUnmatched={unmatched} initialMatched={matched} />
        </>
      )}
    </main>
  );
}
