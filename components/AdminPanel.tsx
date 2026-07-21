"use client";

import { useMemo, useState } from "react";
import type { ScraperLogRow } from "@/lib/fetchScraperLog";
import type { Band } from "@/lib/fetchBands";
import type { NonLocalBand } from "@/lib/fetchNonLocalBands";
import type { DismissedBand } from "@/lib/fetchDismissedBands";
import ScraperDashboard from "@/components/ScraperDashboard";

type ScraperInfo = { id: string; name: string };

// Shape of the digest JSON stored in each log row's RAW_JSON column
// (produced by lib/scrapers/runAll.ts).
type DigestEntry = {
  id: string;
  name: string;
  total: number;
  // Granular disposition (runs since the "truthful counts" change); older log
  // rows only have autoImported, so these are optional and we fall back.
  added?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  autoImported: number;
  // Imported but data-quality-flagged (lib/scrapers/reviewFlags.ts); absent
  // on log rows from before Phase 2.
  flagged?: number;
  queued: number;
  newBandsFound: string[];
  error?: string;
};
type Digest = {
  ranAt: string;
  scrapers: DigestEntry[];
  totalAdded?: number;
  totalUpdated?: number;
  totalSkipped?: number;
  totalFailed?: number;
  totalAutoImported: number;
  totalFlagged?: number;
  totalQueued: number;
  totalNewBands: number;
};

/** Lowercase/hyphenate. Mirrors slugify() in lib/fetchBands.ts. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SECTION_HEADING =
  "text-xs font-semibold uppercase tracking-[0.15em] text-[#E8E0D0]/50";
const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function AdminPanel({
  scrapers,
  log,
  bands,
  nonLocalBands,
  dismissedBands,
  secret,
  logConfigured,
}: {
  scrapers: ScraperInfo[];
  log: ScraperLogRow[];
  bands: Band[];
  nonLocalBands: NonLocalBand[];
  dismissedBands: DismissedBand[];
  secret: string;
  logConfigured: boolean;
}) {
  // Parse each log row's RAW_JSON once (most-recent-first, as sorted server-side).
  const parsed = useMemo(
    () =>
      log.map((row) => {
        let digest: Digest | null = null;
        try {
          digest = row.rawJson ? (JSON.parse(row.rawJson) as Digest) : null;
        } catch {
          digest = null;
        }
        return { row, digest };
      }),
    [log],
  );

  // Most recent digest entry for a given scraper, plus the run's timestamp.
  const latestFor = useMemo(() => {
    return (scraperId: string, scraperName: string) => {
      for (const { row, digest } of parsed) {
        const entry = digest?.scrapers?.find(
          (s) => s.id === scraperId || s.name === scraperName,
        );
        if (entry) return { ranAt: digest?.ranAt || row.timestamp, entry };
      }
      return null;
    };
  }, [parsed]);

  // Historical last-run per scraper, handed to the live dashboard so idle cards
  // still show "Last run …" from the log.
  const latestByScraper = useMemo(() => {
    const map: Record<string, { ranAt: string; entry: DigestEntry } | null> =
      {};
    for (const s of scrapers) map[s.id] = latestFor(s.id, s.name);
    return map;
  }, [scrapers, latestFor]);

  // Bands flagged "not local" this session — kept in the list with a chip.
  const [notLocalFlagged, setNotLocalFlagged] = useState<Set<string>>(
    new Set(),
  );
  // Bands removed from the visible queue this session.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
  const q = `secret=${encodeURIComponent(secret)}`;

  // Flag a band as not local: keep it in the list with a "Not local" chip and
  // log it in the background. A failed POST is fine — the chip still sticks.
  function flagNotLocal(name: string) {
    setNotLocalFlagged((prev) => new Set(prev).add(name));
    if (submitUrl) {
      void fetch(submitUrl, {
        method: "POST",
        body: new URLSearchParams({
          formType: "nonLocalBand",
          bandName: name,
          bandSlug: slugify(name),
        }),
      }).catch(() => {});
    }
  }

  // Remove a band from the approval queue for good: hide it now and log it so
  // it stays hidden on future loads, including when later shows list the same
  // band. A failed POST is fine — it's hidden this session regardless.
  function removeFromList(name: string) {
    setDismissed((prev) => new Set(prev).add(name));
    if (submitUrl) {
      void fetch(submitUrl, {
        method: "POST",
        body: new URLSearchParams({
          formType: "dismissedBand",
          bandName: name,
          bandSlug: slugify(name),
        }),
      }).catch(() => {});
    }
  }

  // Names already in the directory, for filtering out bands we already have.
  const directoryNames = new Set(
    bands.map((b) => b.name.toLowerCase().trim()),
  );
  // Names previously flagged as non-local, so they don't resurface.
  const nonLocalNames = new Set(
    nonLocalBands.map((b) => b.name.toLowerCase().trim()),
  );
  // Names previously dismissed from the queue, so they stay hidden across
  // reloads even if a later show lists the same band.
  const dismissedNames = new Set(
    dismissedBands.map((b) => b.name.toLowerCase().trim()),
  );

  // Discovered names that aren't in the directory, aren't flagged non-local,
  // and haven't been dismissed before (all case-insensitive), minus any
  // dismissed from the queue this session.
  const trulyNew = (log[0]?.newBandNames ?? []).filter(
    (name) =>
      !directoryNames.has(name.toLowerCase().trim()) &&
      !nonLocalNames.has(name.toLowerCase().trim()) &&
      !dismissedNames.has(name.toLowerCase().trim()),
  );
  const newBands = trulyNew.filter((n) => !dismissed.has(n));

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E0D0]/20 pb-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Twin Scene Admin</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">Scraper management</p>
        </div>
        <a href={`/admin/activity?${q}`} className={BTN}>
          Recent Activity →
        </a>
      </header>

      {!logConfigured && (
        <p className="mb-8 rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-3.5 py-2.5 text-sm text-[#E8E0D0]/90">
          Scraper Log tab isn&apos;t published yet — run history and discovered
          bands will appear once <code>SCRAPER_LOG_CSV_URL</code> has its gid.
          &ldquo;Run now&rdquo; still works.
        </p>
      )}

      {/* 1. SCRAPER STATUS ────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className={SECTION_HEADING}>Scraper status</h2>
        </div>
        <ScraperDashboard
          scrapers={scrapers}
          latestByScraper={latestByScraper}
          secret={secret}
        />
      </section>

      {/* 2. FLAGGED FOR REVIEW ────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className={`${SECTION_HEADING} mb-4`}>Flagged for review</h2>
        {(() => {
          const perVenue = scrapers.map((scraper) => ({
            name: scraper.name,
            flagged: latestFor(scraper.id, scraper.name)?.entry.flagged ?? null,
          }));
          const total = perVenue.reduce((n, v) => n + (v.flagged ?? 0), 0);
          return (
            <div
              className={`${CARD} flex flex-wrap items-center justify-between gap-3`}
            >
              <div className="min-w-0">
                <p className="text-sm text-[#E8E0D0]">
                  {total} show{total === 1 ? "" : "s"} flagged in the last run per venue
                </p>
                <p className="mt-0.5 text-xs text-[#E8E0D0]/55">
                  {perVenue
                    .map(
                      (v) =>
                        `${v.name}: ${v.flagged != null ? v.flagged : "—"}`,
                    )
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a href={`/admin/shows?${q}`} className={BTN}>
                  All shows →
                </a>
                <a href={`/admin/review?${q}`} className={BTN}>
                  Review shows →
                </a>
              </div>
            </div>
          );
        })()}
      </section>

      {/* 3. NEW BANDS DISCOVERED ──────────────────────────────────────── */}
      <section>
        <h2 className={`${SECTION_HEADING} mb-4`}>
          {newBands.length} new{" "}
          {newBands.length === 1 ? "band" : "bands"} not yet in directory
        </h2>
        {newBands.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/55">
            All discovered bands are already in the directory.
          </p>
        ) : (
          <ul className="space-y-2">
            {newBands.map((name) => {
              return (
                <li
                  key={name}
                  className={`${CARD} flex flex-wrap items-center justify-between gap-3`}
                >
                  <span className="min-w-0 break-words text-sm text-[#E8E0D0]">
                    {name}
                  </span>
                  {notLocalFlagged.has(name) ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-[#E8E0D0]/10 px-2 py-1 text-xs text-[#E8E0D0]/50">
                        Not local
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromList(name)}
                        className="cursor-pointer text-xs text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60"
                      >
                        Remove from list
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex shrink-0 items-center">
                      <a
                        href={`/submit?name=${encodeURIComponent(name)}`}
                        className={BTN}
                      >
                        + Add to directory
                      </a>
                      <button
                        type="button"
                        onClick={() => flagNotLocal(name)}
                        className="ml-2 cursor-pointer text-xs text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60"
                      >
                        Not local
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromList(name)}
                        className="ml-2 cursor-pointer text-xs text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
