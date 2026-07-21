// Matches a curator's picks (e.g. crawlspace.ts) against our own upcoming
// shows, so a pick that's already on our list can be starred instead of
// imported as a duplicate. Same normalize+edit-distance approach as
// bandMatcher.ts, applied to venue names and headliners instead of bands.

import type { Show } from "@/lib/fetchShows";
import type { ScrapedShow } from "@/lib/scrapers/types";
import { normalizeText, similarity } from "@/lib/textSimilarity";

const VENUE_MIN_SIM = 0.8;
const HEADLINER_MIN_SIM = 0.75;

function venuesMatch(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return similarity(na, nb) >= VENUE_MIN_SIM;
}

/**
 * Find the show on our list that a curator's pick refers to: same date, same
 * venue (fuzzy), and — only when a venue has more than one show that night —
 * the closer headliner/lineup match. Returns null when nothing clears the
 * headliner bar, so an unrelated same-venue show never gets starred by
 * mistake.
 */
export function findShowMatch(pick: ScrapedShow, shows: Show[]): Show | null {
  if (!pick.date || !pick.headliner) return null;

  const sameNight = shows.filter(
    (s) => s.date === pick.date && venuesMatch(s.venue, pick.venue),
  );
  if (sameNight.length === 0) return null;
  if (sameNight.length === 1) return sameNight[0];

  const normalizedHeadliner = normalizeText(pick.headliner);
  let best: Show | null = null;
  let bestScore = 0;
  for (const show of sameNight) {
    // Score against the title and each individual lineup name, not the whole
    // joined lineup string — a themed-night title (e.g. "Conspiracy Series")
    // leading the lineup would otherwise bloat the string and tank the
    // edit-distance ratio even when the headliner is an exact entry in it.
    const candidates = [show.title, ...show.lineupEntries.map((e) => e.name)];
    const score = Math.max(
      0,
      ...candidates.map((c) => similarity(normalizedHeadliner, normalizeText(c))),
    );
    if (score > bestScore) {
      bestScore = score;
      best = show;
    }
  }
  return bestScore >= HEADLINER_MIN_SIM ? best : null;
}
