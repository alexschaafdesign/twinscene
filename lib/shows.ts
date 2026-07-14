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
import { getCachedBirdhausBands, matchOrCreateBirdhausBand } from "@/lib/birdhaus";

type TransactionSql = postgres.TransactionSql;

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
 * below fills those in against Birdhaus's directory.
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

/**
 * Forward-only Birdhaus matching: for every entry that's still unlinked after
 * buildLineupEntries (i.e. not already resolved via an explicit linkedBands
 * pairing — a scraper's confident match or a human's selection), try an exact
 * case-insensitive match against the cached directory, then fall back to
 * creating an unreviewed band on Birdhaus. Entries that already have a
 * bandSlug are left untouched, so this never overwrites an admin's manual
 * link-band override or a scraper/human's explicit selection. Never throws —
 * a Birdhaus hiccup leaves the entry's bandSlug null, same as today.
 */
async function resolveLineupBandSlugs(entries: LineupEntry[]): Promise<LineupEntry[]> {
  if (entries.every((e) => e.bandSlug)) return entries;

  const directory = await getCachedBirdhausBands();
  const byName = new Map(directory.map((b) => [b.name.trim().toLowerCase(), b.slug]));

  return Promise.all(
    entries.map(async (entry) => {
      if (entry.bandSlug) return entry;

      const cached = byName.get(entry.name.trim().toLowerCase());
      if (cached) return { ...entry, bandSlug: cached };

      const result = await matchOrCreateBirdhausBand(entry.name);
      return result ? { ...entry, bandSlug: result.slug } : entry;
    }),
  );
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
  confidence: string; // reviewFlags.ts ReviewConfidence: "ok" | "flag" | "broken"
  reviewReasons: string[];
};

/**
 * The disposition of an upsert, so callers (the scrape digest) can report
 * "N added, N updated, N already had" rather than one opaque "imported" count:
 * - "created": no row existed for this source_key; a new show was inserted.
 * - "updated": a row existed and was replaced by the fresh scrape.
 * - "skipped": a row existed and is edited_at-locked, so a human edit won and
 *   the scrape was discarded.
 */
export type UpsertOutcome = "created" | "updated" | "skipped";

/**
 * Upsert a scraped/admin-confirmed show by source_key. Mirrors
 * upsertShowRow_/handleShowImport_: if a matching row exists and is
 * edited_at-locked, the write is skipped entirely (a human edit always wins
 * over a re-scrape); otherwise the row is inserted or fully replaced (minus
 * edited_at, which this path never sets). needs_review/confidence/
 * review_reasons come along for the ride but stop updating once a human has
 * set reviewed_at, same idea as the edited_at lock but scoped to review status.
 */
export async function upsertScrapedShow(
  input: ScrapedShowInput,
  actor: string,
): Promise<{ outcome: UpsertOutcome }> {
  // Resolved outside the transaction — these are HTTP calls to Birdhaus, not
  // DB work, so they shouldn't hold a Postgres connection open. Wasted on the
  // rare row that turns out to be edited-locked below, which is fine.
  const lineup = await resolveLineupBandSlugs(input.lineup);

  return sql.begin(async (tx) => {
    const existing = await tx`
      SELECT id, edited_at FROM shows WHERE source_key = ${input.sourceKey} FOR UPDATE
    `;
    if (existing.length > 0 && existing[0].edited_at) {
      return { outcome: "skipped" };
    }
    const wasExisting = existing.length > 0;
    const needsReview = input.confidence !== "ok";

    // Once a human has reviewed a row (reviewed_at set, Phase 3's "looks good"),
    // a re-scrape must not resurrect flags they already cleared — leave
    // needs_review/confidence/review_reasons (and reviewed_at itself) alone.
    const rows = await tx`
      INSERT INTO shows (
        source, source_key, venue_name, title, date, ticket_url, lineup, notes, flyer_url, event_type,
        needs_review, confidence, review_reasons
      ) VALUES (
        ${input.source}, ${input.sourceKey}, ${input.venue}, ${input.title}, ${input.date},
        ${input.link || null}, ${tx.json(lineup)}, ${input.notes || null}, ${input.flyerUrl || null},
        ${input.eventType || null}, ${needsReview}, ${input.confidence}, ${tx.json(input.reviewReasons)}
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
    return { outcome: wasExisting ? "updated" : "created" };
  });
}

export type ManualShowInput = {
  venue: string;
  title: string;
  date: string;
  lineup: LineupEntry[];
  notes: string;
  link: string;
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
      INSERT INTO shows (source, source_key, venue_name, title, date, ticket_url, lineup, notes)
      VALUES (
        'manual', ${sourceKey}, ${input.venue}, ${input.title}, ${input.date},
        ${input.link || null}, ${tx.json(lineup)}, ${input.notes || null}
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
};

/**
 * Update an existing show's editable fields by id and lock it against future
 * re-scrapes. Mirrors handleShowEdit_ (source/source_key/created_at are left
 * untouched, same as the sheet's SOURCE/SOURCE_KEY/ADDED).
 */
export async function editShow(
  id: string,
  input: EditShowInput,
  actor: string,
  submitter?: Submitter,
): Promise<{ success: boolean }> {
  const lineup = await resolveLineupBandSlugs(input.lineup);

  return sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE shows SET
        venue_name = ${input.venue},
        title = ${input.title},
        date = ${input.date},
        ticket_url = ${input.link || null},
        lineup = ${tx.json(lineup)},
        notes = ${input.notes || null},
        edited_at = now(),
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
    const rows = await tx`SELECT lineup FROM shows WHERE id = ${id} FOR UPDATE`;
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
    return { success: true };
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
