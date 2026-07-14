// Data-quality review flags for scraped shows — a QA signal, not a publish
// gate. Distinct from bandMatcher's per-band confidence (which decides band
// *linking*): this looks at the show as a whole and asks "does this look like
// something a human scraped correctly," e.g. a garbled date, a lineup entry
// that's actually a blurb, an implausible bill size. Flagged shows still go
// public (see upsertScrapedShow); only "broken" (no usable date) ones are
// held back, since there's nowhere sane to place them on the timeline.

import type { MatchedShow } from "@/lib/bandMatcher";

export type ReviewConfidence = "ok" | "flag" | "broken";

export type ReviewResult = {
  confidence: ReviewConfidence;
  reasons: string[];
};

const MAX_ACTS = 8;
const MAX_BAND_NAME_LENGTH = 60;

// Placeholder/non-musical lineup entries venues sometimes leave in a bill.
const NOISE_NAMES = new Set([
  "tba",
  "tbd",
  "to be announced",
  "to be determined",
  "n/a",
  "na",
  "none",
  "various",
  "various artists",
  "special guest",
  "special guests",
  "and more",
  "more tba",
]);

function isDateValid(date: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime());
}

function isNoiseName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return normalized.length === 0 || NOISE_NAMES.has(normalized);
}

/** Data-quality flags for one scraped show. Never touches band matching. */
export function evaluateShow(show: MatchedShow): ReviewResult {
  if (!isDateValid(show.date)) {
    return { confidence: "broken", reasons: ["missing or unparseable date"] };
  }

  const reasons: string[] = [];
  const names = show.allBands.map((n) => n.trim()).filter(Boolean);

  const noise = names.filter(isNoiseName);
  if (noise.length > 0) {
    reasons.push(`non-musical/placeholder lineup entry: ${noise.join(", ")}`);
  }

  const blurby = names.filter((n) => n.length > MAX_BAND_NAME_LENGTH);
  if (blurby.length > 0) {
    reasons.push(
      `lineup entry reads like a blurb, not a band name (>${MAX_BAND_NAME_LENGTH} chars)`,
    );
  }

  if (names.length > MAX_ACTS) {
    reasons.push(`${names.length} acts on the bill — unusually large`);
  }

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) dupes.add(name);
    seen.add(key);
  }
  if (dupes.size > 0) {
    reasons.push(`duplicate act in lineup: ${Array.from(dupes).join(", ")}`);
  }

  return { confidence: reasons.length > 0 ? "flag" : "ok", reasons };
}

/**
 * Indices into `shows` that look like the same real-world event picked up by
 * more than one source in this run — same date, same venue (case-insensitive),
 * same headliner. Only every show after the first match in each group counts
 * as the duplicate; the first stays untouched.
 */
export function findCrossSourceDuplicates(
  shows: { source: string; date: string | null; venue: string; headliner: string | null; allBands: string[] }[],
): Set<number> {
  const firstSeenAt = new Map<string, number>();
  const dupes = new Set<number>();

  shows.forEach((show, i) => {
    if (!show.date) return;
    const headliner = (show.headliner || show.allBands[0] || "").trim().toLowerCase();
    if (!headliner) return;
    const key = `${show.date}|${show.venue.trim().toLowerCase()}|${headliner}`;

    const first = firstSeenAt.get(key);
    if (first === undefined) {
      firstSeenAt.set(key, i);
    } else if (shows[first].source !== show.source) {
      dupes.add(i);
    }
  });

  return dupes;
}
