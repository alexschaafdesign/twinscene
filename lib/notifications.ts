// In-app notifications: the write side fans out one row per recipient at the
// moment the triggering event happens (notify-on-write), the read side powers
// the header bell + /notifications inbox. See migration 0026 for the schema
// and the dedup/coalesce indexes the ON CONFLICT clauses below rely on.
//
// All three fan-out helpers take a QueryExecutor so they can run inside the
// same transaction as the write that triggered them (lib/shows.ts, lib/bands.ts)
// — a notification never survives a write that rolled back, and never blocks on
// a separate connection mid-transaction.

import type postgres from "postgres";
import { sql } from "./db.ts";

type QueryExecutor = postgres.Sql | postgres.TransactionSql;

export type NotificationType = "band_show" | "band_update" | "show_changed";

// --- Fan-out (write side) --------------------------------------------------

// A band the user follows was added to a (future) show. Fans out to every
// follower of every band in `bandSlugs`. Idempotent: the band_show unique index
// means a re-scrape that re-runs this inserts nothing for followers already
// notified about that (band, show). Caller must gate on the show being in the
// future and pass only slugs that are actually linked in the lineup.
export async function notifyBandOnNewShow(
  exec: QueryExecutor,
  showId: string,
  bandSlugs: string[],
): Promise<void> {
  if (bandSlugs.length === 0) return;
  await exec`
    insert into notifications (user_id, type, band_id, show_id)
    select band_follows.user_id, 'band_show', bands.id, ${showId}
    from bands
    join band_follows on band_follows.band_id = bands.id
    where bands.slug in ${exec(bandSlugs)}
    on conflict (user_id, band_id, show_id) where type = 'band_show'
    do nothing
  `;
}

// A band the user follows edited its profile. `changed` is the list of
// follower-visible fields that actually changed value (caller computes it and
// must not call with an empty list). Fans out to followers, excluding the
// editor themselves so nobody gets pinged about their own edit. While an
// earlier update notification is still unread it's coalesced (timestamp +
// changed fields refreshed) rather than duplicated.
export async function notifyBandProfileUpdated(
  exec: QueryExecutor,
  bandId: number,
  changed: string[],
  actorUserId?: number,
): Promise<void> {
  if (changed.length === 0) return;
  // user ids are bigserial (>= 1), so 0 is a safe "no actor to exclude" sentinel.
  const actor = actorUserId ?? 0;
  await exec`
    insert into notifications (user_id, type, band_id, data)
    select band_follows.user_id, 'band_update', ${bandId}, ${exec.json({ changed })}
    from band_follows
    where band_follows.band_id = ${bandId}
      and band_follows.user_id <> ${actor}
    on conflict (user_id, band_id) where type = 'band_update' and read_at is null
    do update set created_at = now(), data = excluded.data
  `;
}

// A show the user saved (interested/going) changed. Fans out to those savers
// only — 'went' is a past show, so a change to it is moot. `changed` describes
// what moved (e.g. ["date"], ["venue"]) for the inbox copy. Coalesced per
// (user, show) while unread.
export async function notifyShowChanged(
  exec: QueryExecutor,
  showId: string,
  changed: string[],
): Promise<void> {
  if (changed.length === 0) return;
  await exec`
    insert into notifications (user_id, type, show_id, data)
    select show_saves.user_id, 'show_changed', ${showId}, ${exec.json({ changed })}
    from show_saves
    where show_saves.show_id = ${showId}
      and show_saves.status in ('interested', 'going')
    on conflict (user_id, show_id) where type = 'show_changed' and read_at is null
    do update set created_at = now(), data = excluded.data
  `;
}

// --- Read side -------------------------------------------------------------

export interface NotificationItem {
  id: number;
  type: NotificationType;
  data: { changed?: string[] } | null;
  read_at: string | null;
  created_at: string;
  band_slug: string | null;
  band_name: string | null;
  show_id: string | null;
  show_title: string | null;
  show_date: string | null;
  venue_name: string | null;
}

export async function getUnreadCount(userId: number): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    select count(*) as count from notifications
    where user_id = ${userId} and read_at is null
  `;
  return Number(row?.count ?? 0);
}

// Newest first. Joins bands/shows so the caller can render each row without a
// second query; both joins are LEFT since only one of band_id/show_id is set
// per row (and the referenced row could have been deleted).
export async function listNotifications(
  userId: number,
  limit = 30,
): Promise<NotificationItem[]> {
  return sql<NotificationItem[]>`
    select
      notifications.id,
      notifications.type,
      notifications.data,
      notifications.read_at,
      notifications.created_at,
      bands.slug        as band_slug,
      bands.name        as band_name,
      shows.id          as show_id,
      shows.title       as show_title,
      to_char(shows.date, 'YYYY-MM-DD') as show_date,
      shows.venue_name  as venue_name
    from notifications
    left join bands on bands.id = notifications.band_id
    left join shows on shows.id = notifications.show_id
    where notifications.user_id = ${userId}
    order by notifications.created_at desc
    limit ${limit}
  `;
}

// Marks every unread notification read. Returns how many were flipped, so the
// caller can decide whether a UI refresh is worth it.
export async function markAllRead(userId: number): Promise<number> {
  const rows = await sql`
    update notifications set read_at = now()
    where user_id = ${userId} and read_at is null
    returning id
  `;
  return rows.length;
}
