// Server-only write operations against the Postgres `shows` table — the
// write side of the Shows feature (scraper auto-import, public submit/edit,
// admin relink sweep, press-outlet stars). Mirrors the semantics the old
// Apps Script handlers had against the sheet (see apps-script/Code.js):
// upsert-by-source_key with an edited_at lock, a light-touch link/star that
// doesn't set the lock, etc. Read side lives in lib/fetchShows.ts.
//
// Every write logs a show_history row in the same transaction as the real
// write, so history can never drift out of sync with shows. `actor` is
// always supplied by the caller (never inferred from payload shape) since
// only the caller genuinely knows who/what it is — e.g. /api/scrapers/import
// is hit by both the automated scraper pipeline (actor "scraper:<source>")
// and a human confirming in Import Review (actor "admin").

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { todayInChicago } from "@/lib/fetchShows";
import { notifyBandOnNewShow, notifyShowChanged } from "@/lib/notifications";
import { parseDisplayTime, sqlTimeOrNull } from "@/lib/showTime";
import { normalizeGenres, normalizeAge } from "@/lib/showGenres";

type TransactionSql = postgres.TransactionSql;

/** Linked directory slugs in a resolved lineup, for follower fan-out. */
function linkedSlugs(lineup: LineupEntry[]): string[] {
  return lineup.map((e) => e.bandSlug).filter((s): s is string => !!s);
}

/** A date string is "in the future" (worth notifying about) if it's today or
 * later in America/Chicago. Empty/malformed dates sort before today, so they're
 * naturally excluded. */
function isUpcoming(date: string): boolean {
  return date >= todayInChicago();
}

export type LineupEntry = { name: string; bandSlug: string | null };
export type StarredByEntry = { outlet: string; blurb: string; url: string };

export type Submitter = { name?: string; email?: string };

/** Split a comma-separated lineup string into trimmed, non-empty names. */
function splitNames(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Build lineup entries from a free-text lineup string, pairing each name with
 * a linked band's slug when one matches by name (case-insensitive, exact).
 * Names with no matching linked band get bandSlug: null — resolveLineupBandSlugs
 * below fills those in against the canonical band directory.
 */
export function buildLineupEntries(
  lineup: string,
  linkedBands: { name: string; slug: string }[],
): LineupEntry[] {
  const byName = new Map(linkedBands.map((b) => [b.name.trim().toLowerCase(), b.slug]));
  return splitNames(lineup).map((name) => ({
    name,
    bandSlug: byName.get(name.trim().toLowerCase()) ?? null,
  }));
}

// Lineup matching needs the directory once per show write, not once per lineup
// entry — a 12-venue scrape run would otherwise re-query it dozens of times in a
// few seconds. Short TTL cache over a name/slug projection of the canonical
// `bands` table. Twin Scene owns this table (same DB), so this is a plain local
// query — no HTTP, no API key — replacing the old Birdhaus-API fetch this used
// to go through (getCachedBirdhausBands, lib/birdhaus.ts, removed post-migration).
const MATCH_CACHE_TTL_MS = 60_000;
let matchCache: { directory: { name: string; slug: string }[]; expiresAt: number } | null = null;

async function getCachedBandDirectory(): Promise<{ name: string; slug: string }[]> {
  if (matchCache && matchCache.expiresAt > Date.now()) return matchCache.directory;
  const directory = await sql<{ name: string; slug: string }[]>`select name, slug from bands`;
  matchCache = { directory, expiresAt: Date.now() + MATCH_CACHE_TTL_MS };
  return directory;
}

/**
 * Forward-only directory matching: for every entry that's still unlinked after
 * buildLineupEntries (i.e. not already resolved via an explicit linkedBands
 * pairing — a scraper's confident match or a human's selection), try an exact
 * case-insensitive match against the cached canonical directory. Entries that
 * already have a bandSlug are left untouched, so this never overwrites an admin's
 * manual link-band override or a scraper/human's explicit selection.
 *
 * Deliberately does NOT create a new band for a name with no match — that used
 * to happen here (matchOrCreateBirdhausBand), but once every scraped show started
 * auto-importing (not just confidently band-matched ones), it flooded the
 * directory with bare stub bands for every unmatched opener/support act. An
 * unmatched name now just stays unlinked (bandSlug: null); it still shows up as a
 * name in the lineup, and surfaces in AdminPanel's "New bands discovered" queue
 * (via the scraper digest's confidence:'none' matches) for a human to add
 * deliberately, with an actual profile, via the normal /submit flow.
 */
async function resolveLineupBandSlugs(entries: LineupEntry[]): Promise<LineupEntry[]> {
  if (entries.every((e) => e.bandSlug)) return entries;

  const directory = await getCachedBandDirectory();
  const byName = new Map(directory.map((b) => [b.name.trim().toLowerCase(), b.slug]));

  return entries.map((entry) => {
    if (entry.bandSlug) return entry;
    const cached = byName.get(entry.name.trim().toLowerCase());
    return cached ? { ...entry, bandSlug: cached } : entry;
  });
}

/** Insert one show_history row. Always called inside the write's own transaction. */
async function logHistory(
  tx: TransactionSql,
  showId: string,
  action: string,
  actor: string,
  changedFields: Record<string, unknown> | null,
  submitter?: Submitter,
): Promise<void> {
  await tx`
    INSERT INTO show_history (show_id, action, actor, changed_fields, submitter_name, submitter_email)
    VALUES (
      ${showId}, ${action}, ${actor}, ${changedFields ? tx.json(changedFields as postgres.JSONValue) : null},
      ${submitter?.name || null}, ${submitter?.email || null}
    )
  `;
}

export type ScrapedShowInput = {
  source: string;
  sourceKey: string;
  venue: string;
  title: string;
  date: string;
  lineup: LineupEntry[];
  notes: string;
  link: string;
  flyerUrl: string;
  eventType: string; // non-band listing label (e.g. "Private Event"); "" for shows
  // Display time strings from the scraper ("7:00pm"), stored as venue-local
  // `time` values (music_time/doors_time). "" / null when the source gives no
  // time. Unparseable strings drop to null rather than erroring the import.
  musicTime?: string | null;
  doorsTime?: string | null;
  // Genre suggestions + age restriction (0040). Best-effort from the source;
  // omitted/empty when it doesn't provide them.
  genres?: string[];
  ageRestriction?: string | null;
  // Long-form description + "for fans of" pull-quote (0046). Omitted/null for
  // sources that don't carry one.
  description?: string | null;
  similarTo?: string | null;
  confidence: string; // reviewFlags.ts ReviewConfidence: "ok" | "flag" | "broken"
  reviewReasons: string[];
};

/**
 * The disposition of an upsert, so callers (the scrape digest) can report
 * "N added, N updated, N already had" rather than one opaque "imported" count:
 * - "created": no row existed for this source_key; a new show was inserted.
 * - "updated": a row existed and was replaced by the fresh scrape.
 * - "skipped": either a row existed and is edited_at-locked (a human edit won
 *   and the scrape was discarded), or the source_key was rejected via
 *   /admin/review "Delete" and is tombstoned in rejected_show_sources — either
 *   way, a human already made a call on this row and a re-scrape must not
 *   undo it.
 */
export type UpsertOutcome = "created" | "updated" | "skipped";

/**
 * Upsert a scraped/admin-confirmed show by source_key. Mirrors
 * upsertShowRow_/handleShowImport_: if the source_key was rejected (tombstoned
 * in rejected_show_sources by a prior deleteShow) or a matching row exists and
 * is edited_at-locked, the write is skipped entirely (a human decision always
 * wins over a re-scrape); otherwise the row is inserted or fully replaced
 * (minus edited_at, which this path never sets). needs_review/confidence/
 * review_reasons come along for the ride but stop updating once a human has
 * set reviewed_at, same idea as the edited_at lock but scoped to review status.
 */
export async function upsertScrapedShow(
  input: ScrapedShowInput,
  actor: string,
): Promise<{ outcome: UpsertOutcome; id: string | null }> {
  // Resolved outside the transaction — these are HTTP calls to Birdhaus, not
  // DB work, so they shouldn't hold a Postgres connection open. Wasted on the
  // rare row that turns out to be edited-locked/rejected below, which is fine.
  const lineup = await resolveLineupBandSlugs(input.lineup);

  return sql.begin(async (tx) => {
    const rejected = await tx`
      SELECT 1 FROM rejected_show_sources WHERE source_key = ${input.sourceKey}
    `;
    if (rejected.length > 0) {
      return { outcome: "skipped", id: null };
    }
    const existing = await tx`
      SELECT id, edited_at FROM shows WHERE source_key = ${input.sourceKey} FOR UPDATE
    `;
    if (existing.length > 0 && existing[0].edited_at) {
      return { outcome: "skipped", id: existing[0].id };
    }
    const wasExisting = existing.length > 0;
    const needsReview = input.confidence !== "ok";
    const musicTime = parseDisplayTime(input.musicTime);
    const doorsTime = parseDisplayTime(input.doorsTime);
    const genres = normalizeGenres(input.genres);
    const ageRestriction = normalizeAge(input.ageRestriction);

    // Once a human has reviewed a row (reviewed_at set, Phase 3's "looks good"),
    // a re-scrape must not resurrect flags they already cleared — leave
    // needs_review/confidence/review_reasons (and reviewed_at itself) alone.
    const rows = await tx`
      INSERT INTO shows (
        source, source_key, venue_name, title, date, ticket_url, lineup, notes, flyer_url, event_type,
        music_time, doors_time, genres, age_restriction, description, similar_to,
        needs_review, confidence, review_reasons
      ) VALUES (
        ${input.source}, ${input.sourceKey}, ${input.venue}, ${input.title}, ${input.date},
        ${input.link || null}, ${tx.json(lineup)}, ${input.notes || null}, ${input.flyerUrl || null},
        ${input.eventType || null}, ${musicTime}, ${doorsTime},
        ${tx.json(genres)}, ${ageRestriction}, ${input.description || null}, ${input.similarTo || null},
        ${needsReview}, ${input.confidence}, ${tx.json(input.reviewReasons)}
      )
      ON CONFLICT (source_key) DO UPDATE SET
        source = EXCLUDED.source,
        venue_name = EXCLUDED.venue_name,
        title = EXCLUDED.title,
        date = EXCLUDED.date,
        ticket_url = EXCLUDED.ticket_url,
        lineup = EXCLUDED.lineup,
        notes = EXCLUDED.notes,
        flyer_url = EXCLUDED.flyer_url,
        event_type = EXCLUDED.event_type,
        music_time = EXCLUDED.music_time,
        doors_time = EXCLUDED.doors_time,
        description = EXCLUDED.description,
        similar_to = EXCLUDED.similar_to,
        -- Only overwrite genre/age when this scrape actually carries them, so a
        -- venue re-scrape (most give neither) can't wipe a Crawl Space
        -- suggestion applied out-of-band via reconcile.ts.
        genres = CASE WHEN jsonb_array_length(EXCLUDED.genres) > 0 THEN EXCLUDED.genres ELSE shows.genres END,
        age_restriction = COALESCE(EXCLUDED.age_restriction, shows.age_restriction),
        needs_review = CASE WHEN shows.reviewed_at IS NULL THEN EXCLUDED.needs_review ELSE shows.needs_review END,
        confidence = CASE WHEN shows.reviewed_at IS NULL THEN EXCLUDED.confidence ELSE shows.confidence END,
        review_reasons = CASE WHEN shows.reviewed_at IS NULL THEN EXCLUDED.review_reasons ELSE shows.review_reasons END,
        updated_at = now()
      RETURNING id
    `;

    await logHistory(
      tx,
      rows[0].id,
      wasExisting ? "updated" : "created",
      actor,
      { venue: input.venue, title: input.title, date: input.date, lineup },
    );

    // Notify followers of any linked band on a newly-created upcoming show.
    // Only on "created": re-scrapes of an existing row re-run resolveLineupBandSlugs
    // and would otherwise fan out nightly — and the band_show unique index would
    // dedupe them anyway, but skipping the query entirely is cheaper. A band
    // freshly linked to an *existing* show is instead caught by linkBandToShow.
    if (!wasExisting && isUpcoming(input.date)) {
      await notifyBandOnNewShow(tx, rows[0].id, linkedSlugs(lineup));
    }
    return { outcome: wasExisting ? "updated" : "created", id: rows[0].id };
  });
}

export type ManualShowInput = {
  venue: string;
  title: string;
  date: string;
  lineup: LineupEntry[];
  notes: string;
  link: string;
  flyerUrl?: string;
  // Structured details a scraped show carries, now collectable on the manual
  // add form too. 24-hour "HH:MM" clock strings (""/null clears); genres a list;
  // ageRestriction a freeform label. Absent/empty -> null/[] columns.
  musicTime?: string | null;
  doorsTime?: string | null;
  genres?: string[];
  ageRestriction?: string | null;
};

/** Insert a new manually-submitted show. Mirrors handleShowSubmission_. */
export async function insertManualShow(
  input: ManualShowInput,
  actor: string,
  submitter?: Submitter,
): Promise<{ id: string }> {
  const sourceKey = `manual:${randomUUID()}`;
  const lineup = await resolveLineupBandSlugs(input.lineup);

  return sql.begin(async (tx) => {
    const rows = await tx`
      INSERT INTO shows (
        source, source_key, venue_name, title, date, ticket_url, lineup, notes, flyer_url,
        music_time, doors_time, genres, age_restriction
      )
      VALUES (
        'manual', ${sourceKey}, ${input.venue}, ${input.title}, ${input.date},
        ${input.link || null}, ${tx.json(lineup)}, ${input.notes || null}, ${input.flyerUrl || null},
        ${sqlTimeOrNull(input.musicTime)}, ${sqlTimeOrNull(input.doorsTime)},
        ${tx.json(normalizeGenres(input.genres))}, ${normalizeAge(input.ageRestriction)}
      )
      RETURNING id
    `;
    const id = rows[0].id;
    await logHistory(
      tx,
      id,
      "created",
      actor,
      { venue: input.venue, title: input.title, date: input.date, lineup },
      submitter,
    );
    // Notify followers of any linked band on this upcoming show (e.g. a band's
    // own editor adding a gig from the band form fans out to its followers).
    if (isUpcoming(input.date)) {
      await notifyBandOnNewShow(tx, id, linkedSlugs(lineup));
    }
    return { id };
  });
}

export type EditShowInput = {
  venue: string;
  title: string;
  date: string;
  lineup: LineupEntry[];
  notes: string;
  link: string;
  // 24-hour "HH:MM" clock strings from the edit form's <input type="time">
  // (""/absent clears the column). Undefined means "not part of this edit" —
  // e.g. /admin/review's inline edit, which doesn't send times — so those keep
  // whatever the row already had rather than being nulled out.
  musicTime?: string | null;
  doorsTime?: string | null;
  // Genre suggestions + age restriction (0040). Undefined => not part of this
  // edit (leave the column as-is); a value (incl. [] / "") sets/clears it.
  genres?: string[];
  ageRestriction?: string | null;
};

/**
 * Update an existing show's editable fields by id and lock it against future
 * re-scrapes. Mirrors handleShowEdit_ (source/source_key/created_at are left
 * untouched, same as the sheet's SOURCE/SOURCE_KEY/ADDED). Also clears any
 * data-quality review flag: an edit means a human just took ownership of this
 * row's data (edited_at already locks it out of future re-scrapes entirely),
 * so whatever reviewFlags.ts originally flagged no longer applies.
 */
export async function editShow(
  id: string,
  input: EditShowInput,
  actor: string,
  submitter?: Submitter,
): Promise<{ success: boolean }> {
  const lineup = await resolveLineupBandSlugs(input.lineup);

  return sql.begin(async (tx) => {
    // Read the pre-edit date/venue under the row lock so we can tell savers what
    // actually moved (and skip notifying when neither did).
    const before = await tx<{ venue_name: string; date: string }[]>`
      SELECT venue_name, to_char(date, 'YYYY-MM-DD') AS date FROM shows WHERE id = ${id} FOR UPDATE
    `;
    if (before.length === 0) return { success: false };

    // undefined => this edit doesn't carry times (admin-review inline edit):
    // leave the existing column untouched. A provided value (incl. "") sets it.
    const musicTime =
      input.musicTime === undefined ? tx`music_time` : sqlTimeOrNull(input.musicTime);
    const doorsTime =
      input.doorsTime === undefined ? tx`doors_time` : sqlTimeOrNull(input.doorsTime);
    const genres =
      input.genres === undefined ? tx`genres` : tx.json(normalizeGenres(input.genres));
    const ageRestriction =
      input.ageRestriction === undefined ? tx`age_restriction` : normalizeAge(input.ageRestriction);

    const rows = await tx`
      UPDATE shows SET
        venue_name = ${input.venue},
        title = ${input.title},
        date = ${input.date},
        ticket_url = ${input.link || null},
        lineup = ${tx.json(lineup)},
        notes = ${input.notes || null},
        music_time = ${musicTime},
        doors_time = ${doorsTime},
        genres = ${genres},
        age_restriction = ${ageRestriction},
        edited_at = now(),
        needs_review = false,
        confidence = 'ok',
        review_reasons = '[]',
        reviewed_at = now(),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return { success: false };

    await logHistory(
      tx,
      id,
      "updated",
      actor,
      { venue: input.venue, title: input.title, date: input.date, lineup },
      submitter,
    );

    // Notify savers (interested/going) when the show's date or venue changed —
    // the two facts they planned around. Title/notes/link edits are cosmetic
    // and don't warrant a ping.
    const changed: string[] = [];
    if (before[0].date !== input.date) changed.push("date");
    if (before[0].venue_name !== input.venue) changed.push("venue");
    await notifyShowChanged(tx, id, changed);

    return { success: true };
  });
}

/**
 * Clear a show's review flag once a human has looked at it and it's fine as
 * is. Sets reviewed_at, which upsertScrapedShow then treats as a lock — a
 * future re-scrape won't stomp needs_review/confidence/review_reasons back
 * on. Powers the /admin/review "✓ looks good" action.
 */
export async function markShowReviewed(
  id: string,
  actor: string,
): Promise<{ success: boolean }> {
  return sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE shows SET needs_review = false, reviewed_at = now(), updated_at = now()
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return { success: false };
    await logHistory(tx, id, "reviewed", actor, null);
    return { success: true };
  });
}

/**
 * Delete a show outright — for junk/duplicate rows caught in /admin/review.
 * show_history rows for it cascade (ON DELETE CASCADE), so there's nothing
 * to log afterward. Also tombstones the row's source_key in
 * rejected_show_sources so upsertScrapedShow refuses to resurrect it the next
 * time that venue's scraper runs — otherwise a re-scrape would just re-insert
 * the same junk/duplicate fresh, since ON CONFLICT (source_key) has nothing
 * left to conflict with once the row is gone.
 */
export async function deleteShow(id: string, actor: string): Promise<{ success: boolean }> {
  return sql.begin(async (tx) => {
    const rows = await tx`DELETE FROM shows WHERE id = ${id} RETURNING source_key`;
    if (rows.length === 0) return { success: false };
    await tx`
      INSERT INTO rejected_show_sources (source_key, actor)
      VALUES (${rows[0].source_key}, ${actor})
      ON CONFLICT (source_key) DO NOTHING
    `;
    return { success: true };
  });
}

/**
 * Attach a directory band slug to the lineup entry matching scrapedName (case-
 * insensitive), or append a new entry if none matches. Mirrors
 * handleShowLinkBand_: touches only the lineup, no edited_at lock, so a
 * re-scrape can still refresh the row.
 */
export async function linkBandToShow(
  id: string,
  scrapedName: string,
  bandSlug: string,
  actor: string,
): Promise<{ success: boolean }> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ lineup: unknown; date: string }[]>`
      SELECT lineup, to_char(date, 'YYYY-MM-DD') AS date FROM shows WHERE id = ${id} FOR UPDATE
    `;
    if (rows.length === 0) return { success: false };

    const lineup: LineupEntry[] = Array.isArray(rows[0].lineup) ? rows[0].lineup : [];
    const target = scrapedName.trim().toLowerCase();
    let matched = false;
    const updated = lineup.map((entry) => {
      if (entry.name.trim().toLowerCase() === target) {
        matched = true;
        return { ...entry, bandSlug };
      }
      return entry;
    });
    if (!matched) updated.push({ name: scrapedName, bandSlug });

    await tx`
      UPDATE shows SET lineup = ${tx.json(updated)}, updated_at = now() WHERE id = ${id}
    `;
    await logHistory(tx, id, "linked_band", actor, { scrapedName, bandSlug });

    // This band just got attached to an existing upcoming show — its followers
    // haven't heard about it yet (the show was created before the link existed).
    // The band_show unique index makes this a no-op if they somehow already were.
    if (isUpcoming(rows[0].date)) {
      await notifyBandOnNewShow(tx, id, [bandSlug]);
    }
    return { success: true };
  });
}

/**
 * Fill in genre/age *suggestions* on an existing show from an out-of-band
 * reference source (Crawl Space's daily list; see lib/scrapers/reconcile.ts).
 * Fill-only: sets genres only when the row has none, age only when it's null —
 * never stomps a venue's own categorization or an admin's edit. Light-touch
 * like linkBandToShow/starShow: no edited_at lock, so venue re-scrapes still
 * refresh the row. Returns whether anything actually changed.
 */
export async function annotateShow(
  id: string,
  suggestion: { genres?: string[]; ageRestriction?: string | null },
  actor: string,
): Promise<{ success: boolean; changed: boolean }> {
  const genres = normalizeGenres(suggestion.genres);
  const age = normalizeAge(suggestion.ageRestriction);
  if (genres.length === 0 && !age) return { success: true, changed: false };

  return sql.begin(async (tx) => {
    const rows = await tx<{ genres: unknown; age_restriction: string | null }[]>`
      SELECT genres, age_restriction FROM shows WHERE id = ${id} FOR UPDATE
    `;
    if (rows.length === 0) return { success: false, changed: false };

    const current: string[] = Array.isArray(rows[0].genres) ? (rows[0].genres as string[]) : [];
    const setGenres = current.length === 0 && genres.length > 0;
    const setAge = !rows[0].age_restriction && !!age;
    if (!setGenres && !setAge) return { success: true, changed: false };

    await tx`
      UPDATE shows SET
        genres = ${setGenres ? tx.json(genres) : tx`genres`},
        age_restriction = ${setAge ? age : tx`age_restriction`},
        updated_at = now()
      WHERE id = ${id}
    `;
    await logHistory(tx, id, "annotated", actor, {
      ...(setGenres ? { genres } : {}),
      ...(setAge ? { age_restriction: age } : {}),
    });
    return { success: true, changed: true };
  });
}

/**
 * Add or update one outlet's star on a show: upserts the starred_by entry
 * (new blurb/url win, falling back to the existing ones when blank) and keeps
 * the `starred` boolean in sync. Mirrors handleShowStar_.
 */
export async function starShow(
  id: string,
  outlet: string,
  blurb: string,
  url: string,
  actor: string,
): Promise<{ success: boolean }> {
  return sql.begin(async (tx) => {
    const rows = await tx`SELECT starred_by FROM shows WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) return { success: false };

    const starredBy: StarredByEntry[] = Array.isArray(rows[0].starred_by)
      ? rows[0].starred_by
      : [];
    const existing = starredBy.find((s) => s.outlet === outlet);
    const entry: StarredByEntry = {
      outlet,
      blurb: blurb || existing?.blurb || "",
      url: url || existing?.url || "",
    };
    const updated = existing
      ? starredBy.map((s) => (s.outlet === outlet ? entry : s))
      : [...starredBy, entry];

    await tx`
      UPDATE shows SET starred_by = ${tx.json(updated)}, starred = true, updated_at = now()
      WHERE id = ${id}
    `;
    await logHistory(tx, id, "starred", actor, { outlet, blurb, url });
    return { success: true };
  });
}
