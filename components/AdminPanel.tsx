"use client";

import { useMemo, useState } from "react";
import type { ScraperLogRow } from "@/lib/fetchScraperLog";

type ScraperInfo = { id: string; name: string };

// Shape of the digest JSON stored in each log row's RAW_JSON column
// (produced by lib/scrapers/runAll.ts).
type DigestEntry = {
  id: string;
  name: string;
  total: number;
  autoImported: number;
  queued: number;
  newBandsFound: string[];
  error?: string;
};
type Digest = {
  ranAt: string;
  scrapers: DigestEntry[];
  totalAutoImported: number;
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
  secret,
  logConfigured,
}: {
  scrapers: ScraperInfo[];
  log: ScraperLogRow[];
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

  // Per-band add status for the "New bands discovered" section.
  const [bandStates, setBandStates] = useState<
    Record<string, "idle" | "loading" | "added" | "error">
  >({});

  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
  const q = `secret=${encodeURIComponent(secret)}`;

  async function runScraper(id: string) {
    setRunStates((s) => ({ ...s, [id]: { status: "loading", message: "" } }));
    try {
      const res = await fetch(`/api/scrape/${id}?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRunStates((s) => ({
        ...s,
        [id]: { status: "done", message: `Done — ${data.scraped} shows scraped` },
      }));
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
      setAllState({
        status: "done",
        message: `Done — ${data.totalAutoImported} imported, ${data.totalQueued} queued, ${data.totalNewBands} new bands`,
      });
    } catch (err) {
      setAllState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  async function addBand(name: string) {
    if (!submitUrl) {
      setBandStates((s) => ({ ...s, [name]: "error" }));
      return;
    }
    setBandStates((s) => ({ ...s, [name]: "loading" }));
    try {
      // Stub band: mode 'add' with no photo — a placeholder to flesh out later.
      // Matches the band-submission fields the Apps Script doPost fallthrough
      // reads; deliberately sends no formType.
      const payload = new URLSearchParams({
        mode: "add",
        bandName: name,
        bandSlug: slugify(name),
        status: "Active",
        submitterName: "Admin",
        submitterEmail: "alex@thebirdhaus.org",
        notes: "Discovered via scraper — needs photo and details",
        removeImage: "false",
      });
      const res = await fetch(submitUrl, { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setBandStates((s) => ({ ...s, [name]: "added" }));
    } catch {
      setBandStates((s) => ({ ...s, [name]: "error" }));
    }
  }

  const newBands = log[0]?.newBandNames ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E0D0]/20 pb-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">TCMS Admin</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">Scraper management</p>
        </div>
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
                        ? `${latest.entry.total} scraped, ${latest.entry.autoImported} imported, ${latest.entry.queued} queued`
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

      {/* 2. QUEUED FOR REVIEW ─────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className={`${SECTION_HEADING} mb-4`}>Queued for review</h2>
        <div className="space-y-3">
          {scrapers.map((scraper) => {
            const latest = latestFor(scraper.id, scraper.name);
            const queued = latest?.entry.queued;
            return (
              <div
                key={scraper.id}
                className={`${CARD} flex flex-wrap items-center justify-between gap-3`}
              >
                <div>
                  <p className="text-sm text-[#E8E0D0]">{scraper.name}</p>
                  <p className="mt-0.5 text-xs text-[#E8E0D0]/55">
                    {queued != null
                      ? `${queued} show${queued === 1 ? "" : "s"} queued`
                      : "no recent run"}
                  </p>
                </div>
                <a
                  href={`/shows/import?${q}`}
                  className={BTN}
                >
                  Review imports →
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. NEW BANDS DISCOVERED ──────────────────────────────────────── */}
      <section>
        <h2 className={`${SECTION_HEADING} mb-4`}>New bands discovered</h2>
        {newBands.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/55">
            No new bands in the most recent run.
          </p>
        ) : (
          <ul className="space-y-2">
            {newBands.map((name) => {
              const state = bandStates[name] ?? "idle";
              return (
                <li
                  key={name}
                  className={`${CARD} flex flex-wrap items-center justify-between gap-3`}
                >
                  <span className="min-w-0 break-words text-sm text-[#E8E0D0]">
                    {name}
                  </span>
                  {state === "added" ? (
                    <span className="shrink-0 rounded bg-[#8FD08F]/15 px-2 py-1 text-xs font-medium text-[#8FD08F]">
                      ✓ Added
                    </span>
                  ) : (
                    <div className="shrink-0 text-right">
                      <button
                        type="button"
                        onClick={() => addBand(name)}
                        disabled={state === "loading"}
                        className={BTN}
                      >
                        {state === "loading" ? (
                          <Spinner label="Adding…" />
                        ) : (
                          "+ Add to directory"
                        )}
                      </button>
                      {state === "error" && (
                        <p className="mt-1 text-xs text-[#E5A0A0]">
                          Failed — try again
                        </p>
                      )}
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
