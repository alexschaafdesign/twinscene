// Blanket per-venue age policies.
//
// Some venues have a house age policy that their calendar doesn't state on each
// event, so the scrapers can't pick it up per-show — but we know it as a rule
// (e.g. White Squirrel is 21+ for any show starting at/after 8pm). This module
// derives an age restriction from a scraped show when a venue rule applies, so
// the policy lives in one place rather than being baked into each scraper.
//
// A rule only ever FILLS IN an age restriction the source didn't already carry:
// an explicit per-event value from the venue always wins over the house rule.
// Applied via the scraper registry (lib/scrapers/index.ts), so every consumer
// (cron, on-demand endpoints, the manual import page) gets it uniformly.

import type { ScrapedShow } from "./types";
import { parseDisplayTime } from "@/lib/showTime";

/** Given a scraped show, the age restriction the venue's house rule implies, or
 *  null when the rule doesn't apply to this show. */
type AgeRule = (show: ScrapedShow) => string | null;

/** A show's start time as minutes since midnight ("8:00pm" -> 1200), or null
 *  when the source gave no parseable music time. */
function startMinutes(show: ScrapedShow): number | null {
  const t = parseDisplayTime(show.musicTime); // "8:00pm" -> "20:00"
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Keyed by the exact `venue` string each scraper emits (see each scraper's VENUE
// constant). Add a venue here to give it a blanket policy.
const VENUE_AGE_RULES: Record<string, AgeRule> = {
  // White Squirrel Bar: 21+ for any show starting at 8pm or later. Their Tribe
  // calendar doesn't carry an age field, so we derive it from the start time.
  // A show with no start time is left alone (no rule fires).
  "White Squirrel Bar": (show) => {
    const start = startMinutes(show);
    return start != null && start >= 20 * 60 ? "21+" : null;
  },
};

/** Apply the venue's blanket age policy, filling in `ageRestriction` only when
 *  the scraper didn't already carry one. Returns the show unchanged when no rule
 *  applies (or the show already has an explicit restriction). */
export function applyVenueAgeRule(show: ScrapedShow): ScrapedShow {
  if (show.ageRestriction) return show; // an explicit source value always wins
  const rule = VENUE_AGE_RULES[show.venue];
  if (!rule) return show;
  const age = rule(show);
  return age ? { ...show, ageRestriction: age } : show;
}
