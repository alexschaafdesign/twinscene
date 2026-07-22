// Blanket per-venue age policies (venue_age_rules table, migration 0056).
//
// Some venues have a house age policy their calendar doesn't state on each event
// (e.g. White Squirrel is 21+ for any show starting at/after 8pm), so the
// scrapers can't pick it up per-show. This module holds the policy — read from
// the DB so an admin can edit it from /admin/venues without a deploy — and the
// pure logic that turns a rule into a tag on a scraped show.
//
// A rule only FILLS IN an age restriction the source didn't already carry: an
// explicit per-event value from the venue always wins over the house rule.
// Applied via the scraper registry (lib/scrapers/index.ts), so every consumer
// (cron, on-demand endpoints, the manual import page) gets it uniformly.

import { sql } from "@/lib/db";
import type { ScrapedShow } from "./types";
import { parseDisplayTime } from "@/lib/showTime";

export type VenueAgeRule = {
  venueName: string;
  restriction: string; // label to apply: "21+", "18+", "All Ages"
  // Time-of-day gate as "HH:MM" (24h), or null to apply to every show. null =
  // blanket; a value = only shows starting at/after this clock time.
  appliesAfter: string | null;
};

type VenueAgeRuleRow = {
  venue_name: string;
  restriction: string;
  applies_after: string | null; // Postgres `time` -> "HH:MM:SS"
};

function toRule(row: VenueAgeRuleRow): VenueAgeRule {
  return {
    venueName: row.venue_name,
    restriction: row.restriction,
    // Normalize "HH:MM:SS" -> "HH:MM" so the UI's <input type="time"> round-trips.
    appliesAfter: row.applies_after ? row.applies_after.slice(0, 5) : null,
  };
}

/** Every venue age rule, ordered by venue name. */
export async function getVenueAgeRules(): Promise<VenueAgeRule[]> {
  const rows = await sql<VenueAgeRuleRow[]>`
    SELECT venue_name, restriction, applies_after
    FROM venue_age_rules
    ORDER BY venue_name
  `;
  return rows.map(toRule);
}

/** Rules keyed by venue name, for applying to a batch of scraped shows. */
export async function getVenueAgeRuleMap(): Promise<Map<string, VenueAgeRule>> {
  const rules = await getVenueAgeRules();
  return new Map(rules.map((r) => [r.venueName, r]));
}

/** Add or replace a venue's rule. `appliesAfter` is "HH:MM" or null (blanket). */
export async function upsertVenueAgeRule(
  venueName: string,
  restriction: string,
  appliesAfter: string | null,
): Promise<void> {
  await sql`
    INSERT INTO venue_age_rules (venue_name, restriction, applies_after, updated_at)
    VALUES (${venueName}, ${restriction}, ${appliesAfter}, now())
    ON CONFLICT (venue_name) DO UPDATE SET
      restriction = EXCLUDED.restriction,
      applies_after = EXCLUDED.applies_after,
      updated_at = now()
  `;
}

/** Remove a venue's rule (clears the "none" case). */
export async function deleteVenueAgeRule(venueName: string): Promise<void> {
  await sql`DELETE FROM venue_age_rules WHERE venue_name = ${venueName}`;
}

/** A clock string ("20:00", "8:00pm", "20:00:00") as minutes since midnight, or
 *  null if unparseable. Handles both 24h "HH:MM[:SS]" (stored rules, DB times)
 *  and the scrapers' "8:00pm" display form. */
function clockMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const hhmm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
  const display = parseDisplayTime(raw); // "8:00pm" -> "20:00"
  if (!display) return null;
  const [h, m] = display.split(":").map(Number);
  return h * 60 + m;
}

/** Apply a venue's blanket age policy to one scraped show, filling in
 *  `ageRestriction` only when the scraper didn't already carry one and the
 *  rule's time gate (if any) is satisfied. Pure — the rules map is loaded once
 *  per run and passed in. */
export function applyVenueAgeRule(
  show: ScrapedShow,
  rules: Map<string, VenueAgeRule>,
): ScrapedShow {
  if (show.ageRestriction) return show; // an explicit source value always wins
  const rule = rules.get(show.venue);
  if (!rule) return show;

  if (rule.appliesAfter) {
    const start = clockMinutes(show.musicTime);
    const cutoff = clockMinutes(rule.appliesAfter);
    // No known start time, or it's before the cutoff -> rule doesn't fire.
    if (start == null || cutoff == null || start < cutoff) return show;
  }
  return { ...show, ageRestriction: rule.restriction };
}

/**
 * Apply a rule to shows ALREADY in the DB (the "apply to existing shows" admin
 * action). Fill-only: sets `age_restriction` on matching shows that don't have
 * one yet, so it never clobbers a human's explicit edit. Time-gated rules match
 * only shows whose music_time is at/after the cutoff; blanket rules match every
 * show at the venue. Returns how many rows were updated.
 */
export async function backfillVenueAgeRule(
  rule: VenueAgeRule,
): Promise<{ updated: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE shows
    SET age_restriction = ${rule.restriction}, updated_at = now()
    WHERE venue_name = ${rule.venueName}
      AND (age_restriction IS NULL OR age_restriction = '')
      AND (
        ${rule.appliesAfter}::time IS NULL
        OR (music_time IS NOT NULL AND music_time >= ${rule.appliesAfter}::time)
      )
    RETURNING id
  `;
  return { updated: rows.length };
}
