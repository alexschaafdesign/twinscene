"use client";

import { useMemo, useState } from "react";
import type {
  ScraperDigest,
  ShowRef,
  ScrapeProgressEvent,
  DigestSummary,
} from "@/lib/scrapers/runAll";
import type { PressStarResult } from "@/lib/scrapers/starPress";
import type { ReconcileReport } from "@/lib/scrapers/reconcile";

type ScraperInfo = { id: string; name: string };

// The subset of a digest we read for a venue's historical "last run" line.
// Log rows predating granular counts only have some fields, so all optional.
type HistoricalDigest = {
  total?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  flagged?: number;
  autoImported?: number;
  newBandsFound?: string[];
  error?: string;
};
type Historical = { ranAt: string; entry: HistoricalDigest } | null;

// Route-level stream events wrap the per-venue progress events.
type StreamEvent =
  | { type: "start"; scrapers: ScraperInfo[] }
  | ScrapeProgressEvent
  | { type: "done"; summary: DigestSummary }
  | { type: "error"; error: string };

type Phase =
  | "pending"
  | "scraping"
  | "scraped"
  | "importing"
  | "done"
  | "error";
type VenueState = {
  phase: Phase;
  scrapedCount?: number;
  digest?: ScraperDigest;
  error?: string;
};
type FinalPhase = "press" | "reconcile" | "done" | null;

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-40";

const GREEN = "#8FD08F";
const RED = "#E5A0A0";
const AMBER = "#E8B84B";

/** Human one-liner for a completed venue result. */
function formatResult(d: HistoricalDigest): string {
  if (d.error) return `error — ${d.error}`;
  if (d.added == null) {
    return `${d.total ?? 0} scraped, ${d.autoImported ?? 0} imported`;
  }
  const duplicates = (d.updated ?? 0) + (d.skipped ?? 0);
  const parts = [
    `${d.total ?? 0} scraped`,
    `${d.added} added`,
    `${duplicates} duplicate${duplicates === 1 ? "" : "s"}`,
  ];
  if (d.failed) parts.push(`${d.failed} failed`);
  if (d.flagged) parts.push(`${d.flagged} flagged`);
  return parts.join(" · ");
}

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

function formatDate(date: string): string {
  if (!date) return "no date";
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

const PHASE_LABEL: Record<Phase, string> = {
  pending: "Waiting",
  scraping: "Scraping…",
  scraped: "Scraped",
  importing: "Importing…",
  done: "Done",
  error: "Error",
};

/** A colored status chip for a venue's live phase. */
function StatusPill({ phase, digest }: { phase: Phase; digest?: ScraperDigest }) {
  const busy = phase === "scraping" || phase === "importing";
  let color = "#E8E0D0";
  let bg = "rgba(232,224,208,0.10)";
  if (phase === "error") {
    color = RED;
    bg = "rgba(229,160,160,0.12)";
  } else if (phase === "done") {
    // Done, but flag amber if it turned up review items / failures.
    const needsEyes = (digest?.flagged ?? 0) > 0 || (digest?.failed ?? 0) > 0;
    color = needsEyes ? AMBER : GREEN;
    bg = needsEyes ? "rgba(232,184,75,0.12)" : "rgba(143,208,143,0.12)";
  } else if (busy) {
    color = AMBER;
    bg = "rgba(232,184,75,0.12)";
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color, backgroundColor: bg }}
    >
      {busy && (
        <span
          aria-hidden
          className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent"
        />
      )}
      {phase === "done" &&
      ((digest?.flagged ?? 0) > 0 || (digest?.failed ?? 0) > 0)
        ? "Needs review"
        : PHASE_LABEL[phase]}
    </span>
  );
}

/** One number in the running-totals strip. */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-2xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-[#E8E0D0]/45">
        {label}
      </div>
    </div>
  );
}

/** A drill-down list of shows (flagged / failed / added), each linking out. */
function ShowList({
  shows,
  emptyHint,
  tone,
}: {
  shows: ShowRef[];
  emptyHint: string;
  tone: string;
}) {
  if (shows.length === 0)
    return <p className="text-sm text-[#E8E0D0]/45">{emptyHint}</p>;
  return (
    <ul className="space-y-2">
      {shows.map((s, i) => (
        <li
          key={`${s.id ?? "noid"}-${i}`}
          className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md border border-[rgba(232,224,208,0.12)] px-3 py-2"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-[#E8E0D0]">
                {s.title}
              </span>
              {s.id ? (
                <a
                  href={`/shows/${s.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-[#E8E0D0]/45 underline decoration-dotted hover:text-[#E8E0D0]"
                >
                  view →
                </a>
              ) : null}
            </div>
            <div className="mt-0.5 text-xs text-[#E8E0D0]/50">
              {s.venue} · {formatDate(s.date)}
            </div>
            {s.reasons && s.reasons.length > 0 && (
              <div className="mt-1 text-xs" style={{ color: tone }}>
                {s.reasons.join(" · ")}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ScraperDashboard({
  scrapers,
  latestByScraper,
  secret,
}: {
  scrapers: ScraperInfo[];
  latestByScraper: Record<string, Historical>;
  secret: string;
}) {
  const [venues, setVenues] = useState<Record<string, VenueState>>({});
  const [running, setRunning] = useState(false);
  const [finalPhase, setFinalPhase] = useState<FinalPhase>(null);
  const [summary, setSummary] = useState<DigestSummary | null>(null);
  const [press, setPress] = useState<PressStarResult[] | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileReport | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [runningOne, setRunningOne] = useState<string | null>(null);

  const q = `secret=${encodeURIComponent(secret)}`;

  const patch = (
    id: string,
    update: Partial<VenueState> | ((v: VenueState) => VenueState),
  ) =>
    setVenues((prev) => {
      const cur = prev[id] ?? { phase: "pending" as Phase };
      const next =
        typeof update === "function" ? update(cur) : { ...cur, ...update };
      return { ...prev, [id]: next };
    });

  function handleEvent(e: StreamEvent) {
    switch (e.type) {
      case "start":
        break; // venues already reset to pending before the fetch
      case "scrape_start":
        patch(e.id, { phase: "scraping" });
        break;
      case "scraped":
        patch(e.id, { phase: "scraped", scrapedCount: e.count });
        break;
      case "scrape_error":
        patch(e.id, { phase: "error", error: e.error });
        break;
      case "import_start":
        patch(e.id, (v) =>
          v.phase === "error" ? v : { ...v, phase: "importing" },
        );
        break;
      case "scraper_done": {
        const d = e.digest;
        patch(d.id, {
          phase: d.error ? "error" : "done",
          digest: d,
          error: d.error,
          scrapedCount: d.total,
        });
        break;
      }
      case "press_start":
        setFinalPhase("press");
        break;
      case "press":
        setPress(e.pressStars);
        break;
      case "reconcile_start":
        setFinalPhase("reconcile");
        break;
      case "reconcile":
        setReconcile(e.reconcile);
        break;
      case "done":
        setSummary(e.summary);
        setFinalPhase("done");
        break;
      case "error":
        setGlobalError(e.error);
        break;
    }
  }

  async function runAll() {
    // Reset to a clean slate: every venue pending, prior results cleared.
    const initial: Record<string, VenueState> = {};
    for (const s of scrapers) initial[s.id] = { phase: "pending" };
    setVenues(initial);
    setRunning(true);
    setFinalPhase(null);
    setSummary(null);
    setPress(null);
    setReconcile(null);
    setGlobalError(null);

    try {
      const res = await fetch(`/api/scrape/all?stream=1&${q}`);
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line) as StreamEvent);
        }
      }
      const rest = buf.trim();
      if (rest) handleEvent(JSON.parse(rest) as StreamEvent);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  // Single-venue run (non-streaming) — reuses the existing per-venue endpoint
  // but drops the result into the same live card + drill-down.
  async function runOne(id: string) {
    setRunningOne(id);
    patch(id, {
      phase: "scraping",
      digest: undefined,
      error: undefined,
      scrapedCount: undefined,
    });
    try {
      const res = await fetch(`/api/scrape/${id}?${q}`);
      const data = (await res.json()) as DigestSummary & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const d = data.scrapers?.[0];
      patch(id, {
        phase: d?.error ? "error" : "done",
        digest: d,
        error: d?.error,
        scrapedCount: d?.total,
      });
    } catch (err) {
      patch(id, {
        phase: "error",
        error: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setRunningOne(null);
    }
  }

  const total = scrapers.length;
  const doneCount = scrapers.filter((s) => {
    const p = venues[s.id]?.phase;
    return p === "done" || p === "error";
  }).length;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;
  const started = running || Object.keys(venues).length > 0;

  // Running totals accumulate from each venue's digest as they arrive; after the
  // final `done` event the authoritative summary is preferred.
  const live = useMemo(() => {
    let scraped = 0;
    let added = 0;
    let duplicates = 0;
    let flagged = 0;
    let failed = 0;
    let newBands = 0;
    for (const v of Object.values(venues)) {
      const d = v.digest;
      if (!d) continue;
      scraped += d.total;
      added += d.added;
      duplicates += (d.updated ?? 0) + (d.skipped ?? 0);
      flagged += d.flagged;
      failed += d.failed;
      newBands += d.newBandsFound.length;
    }
    if (summary) {
      return {
        scraped,
        added: summary.totalAdded,
        duplicates: summary.totalUpdated + summary.totalSkipped,
        flagged: summary.totalFlagged,
        failed: summary.totalFailed,
        newBands: summary.totalNewBands,
      };
    }
    return { scraped, added, duplicates, flagged, failed, newBands };
  }, [venues, summary]);

  // Every flagged / failed / newly-added show across venues, for drill-down.
  const attention = useMemo(() => {
    const flaggedS: ShowRef[] = [];
    const failedS: ShowRef[] = [];
    const addedS: ShowRef[] = [];
    for (const v of Object.values(venues)) {
      const d = v.digest;
      if (!d) continue;
      for (const s of d.flaggedShows ?? []) flaggedS.push(s);
      for (const s of d.failedShows ?? []) failedS.push(s);
      for (const s of d.addedShows ?? []) addedS.push(s);
    }
    const byDate = (a: ShowRef, b: ShowRef) =>
      (a.date || "9999").localeCompare(b.date || "9999");
    return {
      flagged: flaggedS.sort(byDate),
      failed: failedS.sort(byDate),
      added: addedS.sort(byDate),
    };
  }, [venues]);

  return (
    <div>
      {/* Control + progress header */}
      <div className={`${CARD} mb-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-[#E8E0D0]">Run all scrapers</p>
            <p className="mt-1 text-xs text-[#E8E0D0]/55">
              {running
                ? finalPhase === "press"
                  ? "Finalizing — matching press picks…"
                  : finalPhase === "reconcile"
                    ? "Finalizing — reconciling against Crawl Space…"
                    : `Running — ${doneCount} of ${total} venues done`
                : summary
                  ? `Finished — ${live.added} added, ${live.flagged} to review`
                  : `${total} venues · scrapes every source, imports, then press picks + Crawl Space reconcile`}
            </p>
          </div>
          <button
            type="button"
            onClick={runAll}
            disabled={running}
            className={BTN_PRIMARY}
          >
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                />
                Running…
              </span>
            ) : (
              "Run all scrapers"
            )}
          </button>
        </div>

        {started && (
          <>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(232,224,208,0.12)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor:
                    finalPhase && finalPhase !== "done" ? AMBER : GREEN,
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Scraped" value={live.scraped} />
              <Stat label="Added" value={live.added} accent={GREEN} />
              <Stat label="Duplicates" value={live.duplicates} />
              <Stat
                label="To review"
                value={live.flagged}
                accent={live.flagged ? AMBER : undefined}
              />
              <Stat
                label="Failed"
                value={live.failed}
                accent={live.failed ? RED : undefined}
              />
              <Stat label="New bands" value={live.newBands} />
            </div>
          </>
        )}

        {globalError && (
          <p className="mt-3 text-sm" style={{ color: RED }}>
            {globalError}
          </p>
        )}
      </div>

      {/* Per-venue live grid */}
      <div className="space-y-3">
        {scrapers.map((scraper) => {
          const v = venues[scraper.id];
          const hist = latestByScraper[scraper.id];
          const showLive = v && v.phase !== "pending";
          const busyThis = runningOne === scraper.id;

          let resultLine: React.ReactNode;
          if (v?.phase === "pending" && running) {
            resultLine = (
              <span className="text-[#E8E0D0]/45">Waiting to start…</span>
            );
          } else if (v?.phase === "scraping") {
            resultLine = <span className="text-[#E8E0D0]/55">Scraping…</span>;
          } else if (v?.phase === "scraped") {
            resultLine = (
              <span className="text-[#E8E0D0]/55">
                {v.scrapedCount ?? 0} found — queued for import…
              </span>
            );
          } else if (v?.phase === "importing") {
            resultLine = (
              <span className="text-[#E8E0D0]/55">
                {v.scrapedCount ?? 0} found — importing…
              </span>
            );
          } else if (v?.digest) {
            resultLine = (
              <span className="text-[#E8E0D0]/70">{formatResult(v.digest)}</span>
            );
          } else if (v?.phase === "error") {
            resultLine = (
              <span style={{ color: RED }}>error — {v.error}</span>
            );
          } else if (hist) {
            resultLine = (
              <span className="text-[#E8E0D0]/55">
                Last run {formatTs(hist.ranAt)} · {formatResult(hist.entry)}
              </span>
            );
          } else {
            resultLine = <span className="text-[#E8E0D0]/45">Never run</span>;
          }

          const d = v?.digest;
          const hasDetail =
            d &&
            ((d.flaggedShows?.length ?? 0) > 0 ||
              (d.failedShows?.length ?? 0) > 0 ||
              (d.addedShows?.length ?? 0) > 0);

          return (
            <div key={scraper.id} className={CARD}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="font-medium text-[#E8E0D0]">{scraper.name}</p>
                    {showLive && v && (
                      <StatusPill phase={v.phase} digest={v.digest} />
                    )}
                  </div>
                  <p className="mt-1.5 text-xs">{resultLine}</p>
                </div>
                <button
                  type="button"
                  onClick={() => runOne(scraper.id)}
                  disabled={running || busyThis}
                  className={BTN}
                >
                  {busyThis ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                      />
                      Running…
                    </span>
                  ) : (
                    "Run now"
                  )}
                </button>
              </div>

              {hasDetail && d && (
                <details className="mt-3 border-t border-[rgba(232,224,208,0.10)] pt-3">
                  <summary className="cursor-pointer text-xs text-[#E8E0D0]/55 hover:text-[#E8E0D0]">
                    {[
                      (d.addedShows?.length ?? 0) > 0 &&
                        `${d.addedShows!.length} added`,
                      (d.flaggedShows?.length ?? 0) > 0 &&
                        `${d.flaggedShows!.length} to review`,
                      (d.failedShows?.length ?? 0) > 0 &&
                        `${d.failedShows!.length} failed`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    — show details
                  </summary>
                  <div className="mt-3 space-y-4">
                    {(d.flaggedShows?.length ?? 0) > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                          Flagged for review
                        </p>
                        <ShowList
                          shows={d.flaggedShows ?? []}
                          emptyHint=""
                          tone={AMBER}
                        />
                      </div>
                    )}
                    {(d.failedShows?.length ?? 0) > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                          Failed to import
                        </p>
                        <ShowList
                          shows={d.failedShows ?? []}
                          emptyHint=""
                          tone={RED}
                        />
                      </div>
                    )}
                    {(d.addedShows?.length ?? 0) > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                          Newly added
                        </p>
                        <ShowList
                          shows={d.addedShows ?? []}
                          emptyHint=""
                          tone={GREEN}
                        />
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Finale: shows needing attention across all venues */}
      {(attention.flagged.length > 0 || attention.failed.length > 0) && (
        <div className={`${CARD} mt-6`}>
          <p className="mb-3 text-sm font-medium text-[#E8E0D0]">
            Shows needing attention ({attention.flagged.length +
              attention.failed.length}
            )
          </p>
          {attention.failed.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                Failed to import
              </p>
              <ShowList shows={attention.failed} emptyHint="" tone={RED} />
            </div>
          )}
          {attention.flagged.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                Flagged for review
              </p>
              <ShowList shows={attention.flagged} emptyHint="" tone={AMBER} />
            </div>
          )}
        </div>
      )}

      {/* Finale: press picks + Crawl Space reconcile */}
      {(press || reconcile || finalPhase === "press" || finalPhase === "reconcile") && (
        <div className={`${CARD} mt-6`}>
          <p className="mb-3 text-sm font-medium text-[#E8E0D0]">
            Cross-source pass
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                Press picks (starred)
              </p>
              {press ? (
                press.length === 0 ? (
                  <p className="text-sm text-[#E8E0D0]/45">No outlets ran.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-[#E8E0D0]/70">
                    {press.map((p) => (
                      <li key={p.id}>
                        {p.name}: {p.starred} starred
                        {p.unmatched ? `, ${p.unmatched} unmatched` : ""}
                        {p.errors ? `, ${p.errors} errors` : ""}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="text-sm text-[#E8E0D0]/45">
                  {finalPhase === "press" ? "Running…" : "Waiting…"}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/45">
                Crawl Space reconcile
              </p>
              {reconcile ? (
                <ul className="space-y-1 text-sm text-[#E8E0D0]/70">
                  <li>{reconcile.total} entries parsed</li>
                  <li>{reconcile.matched} matched our shows</li>
                  <li>{reconcile.applied} genre/age suggestions applied</li>
                  <li className={reconcile.unmatched ? "" : "text-[#E8E0D0]/45"}>
                    {reconcile.unmatched} listed that we&apos;re missing
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-[#E8E0D0]/45">
                  {finalPhase === "reconcile" ? "Running…" : "Waiting…"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
