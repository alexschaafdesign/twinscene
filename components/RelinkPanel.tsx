"use client";

import { useState } from "react";

// A scheduled show whose lineup names a band that's now in the directory but
// isn't linked yet. Computed server-side in the import page.
export type LinkSuggestion = {
  showId: string;
  showTitle: string;
  date: string;
  venue: string;
  scrapedName: string; // the lineup name as it appears on the show
  bandSlug: string; // directory band it now matches
  bandName: string;
  confidence: "auto" | "review";
};

type RowStatus = "idle" | "submitting" | "done" | "error";

/** "2026-07-25" → "Jul 25". Falls back to the raw string. */
function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function SuggestionRow({
  suggestion,
  secret,
}: {
  suggestion: LinkSuggestion;
  secret: string;
}) {
  const [status, setStatus] = useState<RowStatus>("idle");
  const [error, setError] = useState("");

  async function link() {
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/shows/link-band", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          id: suggestion.showId,
          scrapedName: suggestion.scrapedName,
          bandSlug: suggestion.bandSlug,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Link failed");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const done = status === "done";

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] px-4 py-3">
      <div className="min-w-0 text-sm">
        <span className="text-[#E8E0D0]/60">
          {shortDate(suggestion.date)} · {suggestion.venue} ·{" "}
        </span>
        <span className="text-[#E8E0D0]">{suggestion.showTitle}</span>
        <div className="mt-0.5 text-[#E8E0D0]/70">
          Lineup lists{" "}
          <span className="text-[#E8E0D0]">
            &ldquo;{suggestion.scrapedName}&rdquo;
          </span>{" "}
          → matches{" "}
          <span className="font-medium text-[#E8E0D0]">
            {suggestion.bandName}
          </span>
          {suggestion.confidence === "review" && (
            <span className="ml-1.5 rounded bg-[#E8B84B]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#E8B84B]">
              check
            </span>
          )}
        </div>
        {status === "error" && (
          <p className="mt-1 text-xs text-[#E5A0A0]">{error}</p>
        )}
      </div>

      {done ? (
        <span className="shrink-0 rounded bg-[#6FBF73]/20 px-2 py-1 text-xs font-medium text-[#8FD693]">
          Linked
        </span>
      ) : (
        <button
          type="button"
          onClick={link}
          disabled={status === "submitting"}
          className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "submitting" ? "Linking…" : "Link"}
        </button>
      )}
    </li>
  );
}

export default function RelinkPanel({
  suggestions,
  secret,
}: {
  suggestions: LinkSuggestion[];
  secret: string;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border border-[#E8B84B]/30 bg-[#E8B84B]/[0.06] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-[#E8E0D0]">
        {suggestions.length} scheduled show
        {suggestions.length === 1 ? "" : "s"} can be linked to a directory band
      </h2>
      <p className="mt-1 text-xs text-[#E8E0D0]/60">
        These shows list a band by name that&apos;s now in the directory but
        isn&apos;t linked. Linking adds it to the show and to the band&apos;s
        profile.
      </p>
      <ul className="mt-4 space-y-2">
        {suggestions.map((s) => (
          <SuggestionRow
            key={`${s.showId}-${s.bandSlug}`}
            suggestion={s}
            secret={secret}
          />
        ))}
      </ul>
    </section>
  );
}
