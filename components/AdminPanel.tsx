"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScraperLogRow } from "@/lib/fetchScraperLog";
import type { Band } from "@/lib/fetchBands";
import type { NonLocalBand } from "@/lib/fetchNonLocalBands";
import type { DismissedBand } from "@/lib/fetchDismissedBands";

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

/**
 * A human-readable one-liner for a scraper's run — "40 scraped · 2 added · 38
 * duplicates". Duplicates = shows we already had (updated + left-alone). Falls
 * back to the old "N imported" phrasing for log rows predating granular counts.
 */
function formatResult(entry: DigestEntry): string {
  if (entry.added == null) {
    return `${entry.total} scraped, ${entry.autoImported} imported, ${entry.queued} queued`;
  }
  const duplicates = (entry.updated ?? 0) + (entry.skipped ?? 0);
  const parts = [
    `${entry.total} scraped`,
    `${entry.added} added`,
    `${duplicates} duplicate${duplicates === 1 ? "" : "s"}`,
  ];
  if (entry.failed) parts.push(`${entry.failed} failed`);
  if (entry.flagged) parts.push(`${entry.flagged} flagged for review`);
  return parts.join(", ");
}

/** Lowercase/hyphenate. Mirrors slugify() in lib/fetchBands.ts. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Format an ISO timestamp for display, falling back to the raw string. */
function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SECTION_HEADING =
  "text-xs font-semibold uppercase tracking-[0.15em] text-[#E8E0D0]/50";
const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-40";

type RunState = { status: "idle" | "loading" | "done" | "error"; message: string };
const IDLE: RunState = { status: "idle", message: "" };

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

  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [allState, setAllState] = useState<RunState>(IDLE);

  // Bands flagged "not local" this session — kept in the list with a chip.
  const [notLocalFlagged, setNotLocalFlagged] = useState<Set<string>>(
    new Set(),
  );
  // Bands removed from the visible queue this session.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
  const q = `secret=${encodeURIComponent(secret)}`;

  const [graphicState, setGraphicState] = useState<RunState>(IDLE);
  const [graphicPreviewUrl, setGraphicPreviewUrl] = useState<string | null>(null);

  // Revoke the previous blob URL whenever a new preview replaces it or the
  // panel unmounts, so we don't leak object URLs across regenerations.
  useEffect(() => {
    return () => {
      if (graphicPreviewUrl) URL.revokeObjectURL(graphicPreviewUrl);
    };
  }, [graphicPreviewUrl]);

  async function downloadTodayGraphic() {
    setGraphicState({ status: "loading", message: "" });
    try {
      const res = await fetch("/api/og/today");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const showDate = res.headers.get("X-Show-Date") || "today";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setGraphicPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      const a = document.createElement("a");
      a.href = url;
      a.download = `twinscene-shows-${showDate}.png`;
      a.click();

      setGraphicState({ status: "done", message: "Downloaded." });
    } catch (err) {
      setGraphicState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  async function runScraper(id: string) {
    setRunStates((s) => ({ ...s, [id]: { status: "loading", message: "" } }));
    try {
      const res = await fetch(`/api/scrape/${id}?${q}`);
      const data = (await res.json()) as Digest & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const entry = data.scrapers?.[0];
      const message = entry ? `Done — ${formatResult(entry)}` : "Done";
      setRunStates((s) => ({ ...s, [id]: { status: "done", message } }));
    } catch (err) {
      setRunStates((s) => ({
        ...s,
        [id]: {
          status: "error",
          message: err instanceof Error ? err.message : "Failed",
        },
      }));
    }
  }

  async function runAll() {
    setAllState({ status: "loading", message: "" });
    try {
      const res = await fetch(`/api/scrape/all?${q}`);
      const data = (await res.json()) as Digest & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const scrapedTotal = (data.scrapers ?? []).reduce(
        (n, s) => n + (s.total ?? 0),
        0,
      );
      const message =
        data.totalAdded == null
          ? `Done — ${data.totalAutoImported} imported, ${data.totalQueued} queued, ${data.totalNewBands} new bands`
          : `Done — ${scrapedTotal} scraped, ${data.totalAdded} added, ${
              (data.totalUpdated ?? 0) + (data.totalSkipped ?? 0)
            } duplicates${data.totalFailed ? `, ${data.totalFailed} failed` : ""}${
              data.totalFlagged ? `, ${data.totalFlagged} flagged for review` : ""
            }, ${data.totalNewBands} new bands`;
      setAllState({ status: "done", message });
    } catch (err) {
      setAllState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }

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
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
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

      {/* 0. SHOW GRAPHICS ─────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className={SECTION_HEADING}>Show graphics</h2>
        </div>
        <div className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-[#E8E0D0]">Today&apos;s show graphic</p>
              <p className="mt-1 text-xs text-[#E8E0D0]/55">
                Generates the story-format PNG for tomorrow&apos;s date (it&apos;s
                labeled &ldquo;TODAY&rdquo; since it&apos;s meant to be posted
                the day of).
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTodayGraphic}
              disabled={graphicState.status === "loading"}
              className={BTN_PRIMARY}
            >
              {graphicState.status === "loading" ? (
                <Spinner label="Generating…" />
              ) : (
                "Download today's show graphic"
              )}
            </button>
          </div>

          {graphicState.status !== "idle" && graphicState.status !== "loading" && (
            <p
              className={`mt-3 text-sm ${
                graphicState.status === "error" ? "text-[#E5A0A0]" : "text-[#8FD08F]"
              }`}
            >
              {graphicState.message}
            </p>
          )}

          {graphicPreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={graphicPreviewUrl}
              alt="Preview of today's show graphic"
              className="mt-4 w-40 rounded-md border border-[#E8E0D0]/15"
            />
          )}
        </div>
      </section>

      {/* 1. SCRAPER STATUS ────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className={SECTION_HEADING}>Scraper status</h2>
          <button
            type="button"
            onClick={runAll}
            disabled={allState.status === "loading"}
            className={BTN_PRIMARY}
          >
            {allState.status === "loading" ? (
              <Spinner label="Running all…" />
            ) : (
              "Run all scrapers"
            )}
          </button>
        </div>

        {allState.status !== "idle" && allState.status !== "loading" && (
          <p
            className={`mb-4 text-sm ${
              allState.status === "error" ? "text-[#E5A0A0]" : "text-[#8FD08F]"
            }`}
          >
            {allState.message}
          </p>
        )}

        <div className="space-y-3">
          {scrapers.map((scraper) => {
            const latest = latestFor(scraper.id, scraper.name);
            const run = runStates[scraper.id] ?? IDLE;
            return (
              <div key={scraper.id} className={CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#E8E0D0]">{scraper.name}</p>
                    <p className="mt-1 text-xs text-[#E8E0D0]/55">
                      Last run:{" "}
                      {latest ? formatTs(latest.ranAt) : "Never"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#E8E0D0]/55">
                      Last result:{" "}
                      {latest && !latest.entry.error
                        ? formatResult(latest.entry)
                        : latest?.entry.error
                          ? `error — ${latest.entry.error}`
                          : "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <button
                      type="button"
                      onClick={() => runScraper(scraper.id)}
                      disabled={run.status === "loading"}
                      className={BTN}
                    >
                      {run.status === "loading" ? (
                        <Spinner label="Running…" />
                      ) : (
                        "Run now"
                      )}
                    </button>
                    {run.status === "done" && (
                      <p className="mt-1.5 text-xs text-[#8FD08F]">
                        {run.message}
                      </p>
                    )}
                    {run.status === "error" && (
                      <p className="mt-1.5 text-xs text-[#E5A0A0]">
                        {run.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
              <a href={`/admin/review?${q}`} className={BTN}>
                Review shows →
              </a>
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

/** Small inline spinner + label for loading buttons. */
function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      />
      {label}
    </span>
  );
}
