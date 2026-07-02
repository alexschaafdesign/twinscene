"use client";

import { useMemo, useState } from "react";

export type ImportMatch = {
  scrapedName: string;
  slug: string;
  bandName: string;
  confidence: "auto" | "review";
  imported: boolean;
};

export type ImportShow = {
  date: string | null;
  venue: string;
  headliner: string | null;
  allBands: string[];
  flyerUrl: string | null;
  ticketUrl: string | null;
  doorsTime: string | null;
  musicTime: string | null;
  advancePrice: number | null;
  dosPrice: number | null;
  matches: ImportMatch[];
};

type RowStatus = "idle" | "submitting" | "done" | "error";

/** Format "YYYY-MM-DD" as "Sat, Jul 12" in UTC. Falls back to the raw string. */
function formatDate(date: string | null): string {
  if (!date) return "Date TBA";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/**
 * Build the NOTES string for a show: every band NOT being linked (unmatched
 * acts plus any matched band the user deselected), followed by door/music
 * times and prices. This is where the extra scraped detail lives for now.
 */
function composeNotes(show: ImportShow, linkedScrapedNames: Set<string>): string {
  const parts: string[] = [];

  const others = show.allBands.filter((b) => !linkedScrapedNames.has(b));
  if (others.length > 0) parts.push(`With ${others.join(", ")}`);

  const times: string[] = [];
  if (show.doorsTime) times.push(`Doors ${show.doorsTime}`);
  if (show.musicTime) times.push(`Music ${show.musicTime}`);
  if (times.length > 0) parts.push(times.join(" / "));

  const prices: string[] = [];
  if (show.advancePrice != null) prices.push(`$${show.advancePrice} adv`);
  if (show.dosPrice != null) prices.push(`$${show.dosPrice} dos`);
  if (prices.length > 0) parts.push(prices.join(" / "));

  return parts.join(" · ");
}

function ConfidenceBadge({ confidence }: { confidence: "auto" | "review" }) {
  const isAuto = confidence === "auto";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        isAuto
          ? "bg-[#6FBF73]/20 text-[#8FD693]"
          : "bg-[#D9A441]/20 text-[#E4BC6E]"
      }`}
    >
      {isAuto ? "auto" : "review"}
    </span>
  );
}

function ShowRow({ show }: { show: ImportShow }) {
  // Pre-select high-confidence matches that aren't already in the sheet.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        show.matches
          .filter((m) => m.confidence === "auto" && !m.imported)
          .map((m) => m.slug),
      ),
  );
  const [status, setStatus] = useState<RowStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const selectable = show.matches.filter((m) => !m.imported);
  const canImport = status !== "submitting" && status !== "done" && selected.size > 0;

  async function importShow() {
    const url = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
    if (!url) {
      setStatus("error");
      setErrorMsg("Submission endpoint isn't configured.");
      return;
    }

    const chosen = show.matches.filter((m) => selected.has(m.slug));
    if (chosen.length === 0) return;

    const linkedScrapedNames = new Set(chosen.map((m) => m.scrapedName));

    setStatus("submitting");
    setErrorMsg("");

    try {
      const payload = new URLSearchParams({
        formType: "show",
        date: show.date ?? "",
        venue: show.venue,
        notes: composeNotes(show, linkedScrapedNames),
        link: show.ticketUrl ?? "",
        submitterName: "Twin Scene Importer",
        submitterEmail: "importer@twinscene.org",
        bandSlugs: chosen.map((m) => m.slug).join(","),
        bandNames: chosen.map((m) => m.bandName).join(","),
      });

      const res = await fetch(url, { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Import failed");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <li className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-4">
      <div className="flex gap-4">
        {show.flyerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external flyer art
          <img
            src={show.flyerUrl}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded object-cover ring-1 ring-[#E8E0D0]/10"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#E8E0D0]">
              {formatDate(show.date)}
            </p>
            <span className="shrink-0 text-xs text-[#E8E0D0]/55">
              {show.venue}
            </span>
          </div>
          {show.headliner && (
            <p className="mt-0.5 truncate text-sm text-[#E8E0D0]/75">
              {show.headliner}
              {show.allBands.length > 1 && (
                <span className="text-[#E8E0D0]/45">
                  {" "}
                  + {show.allBands.length - 1} more
                </span>
              )}
            </p>
          )}

          {selectable.length === 0 ? (
            <p className="mt-3 text-xs text-[#E8E0D0]/45">
              {show.matches.length === 0
                ? "No directory bands matched — nothing to link."
                : "All matched bands already imported."}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {selectable.map((m) => (
                <li key={m.slug} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`${show.date}-${m.slug}`}
                    checked={selected.has(m.slug)}
                    onChange={() => toggle(m.slug)}
                    disabled={status === "submitting" || status === "done"}
                    className="h-4 w-4 accent-[#E8E0D0]"
                  />
                  <label
                    htmlFor={`${show.date}-${m.slug}`}
                    className="flex items-center gap-2"
                  >
                    <span className="text-[#E8E0D0]">{m.bandName}</span>
                    {m.scrapedName !== m.bandName && (
                      <span className="text-xs text-[#E8E0D0]/45">
                        (from “{m.scrapedName}”)
                      </span>
                    )}
                    <ConfidenceBadge confidence={m.confidence} />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {status === "error" && (
            <p className="mt-2 text-xs text-[#E5A0A0]">{errorMsg}</p>
          )}

          {selectable.length > 0 && (
            <button
              type="button"
              onClick={importShow}
              disabled={!canImport}
              className="mt-3 rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "submitting"
                ? "Importing…"
                : status === "done"
                  ? "Imported ✓"
                  : `Import ${selected.size} band${selected.size === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ShowImportReview({ shows }: { shows: ImportShow[] }) {
  const linkableCount = useMemo(
    () => shows.filter((s) => s.matches.some((m) => !m.imported)).length,
    [shows],
  );

  if (shows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
        No shows scraped.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-[#E8E0D0]/50">
        {shows.length} bill{shows.length === 1 ? "" : "s"} scraped ·{" "}
        {linkableCount} with new directory-band matches
      </p>
      <ul className="space-y-3">
        {shows.map((show, i) => (
          <ShowRow key={`${show.date}-${show.headliner}-${i}`} show={show} />
        ))}
      </ul>
    </div>
  );
}
