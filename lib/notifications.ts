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

export type NotificationType = "band_show" | "band_update" | "show_changed" | "new_message";

// Longest message preview stored in a notification's data.snippet.
const SNIPPET_MAX = 140;

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

// A message was sent in a conversation. Fans out to everyone who can see that
// conversation EXCEPT the sender: the human initiator (conversation_participants)
// plus the recipient side — every editor of the addressed band, or the linked
// musician's user. Idempotent-ish via the (user, conversation) unread coalesce
// index: a burst of replies collapses into one unread ping whose snippet +
// timestamp track the latest message. Runs inside sendMessage's transaction, so
// a notification never survives a rolled-back message. `body` is the raw message
// text; the stored snippet is a truncated, POV-independent preview.
export async function notifyNewMessage(
  exec: QueryExecutor,
  conversationId: string,
  senderUserId: number,
  body: string,
): Promise<void> {
  const snippet = body.trim().slice(0, SNIPPET_MAX);
  await exec`
    insert into notifications (user_id, type, conversation_id, data)
    select recipients.user_id, 'new_message', ${conversationId}, ${exec.json({ snippet })}
    from (
      select user_id
        from conversation_participants
        where conversation_id = ${conversationId}
      union
      select be.user_id
        from band_editors be
        join conversations c on c.id = ${conversationId}
        where c.recipient_type = 'band' and be.band_id = c.recipient_id
      union
      select m.user_id
        from musicians m
        join conversations c on c.id = ${conversationId}
        where c.recipient_type = 'musician' and m.id = c.recipient_id
          and m.user_id is not null
    ) recipients
    where recipients.user_id <> ${senderUserId}
    on conflict (user_id, conversation_id)
      where type = 'new_message' and read_at is null
    do update set created_at = now(), data = excluded.data
  `;
}

// --- Read side -------------------------------------------------------------

export interface NotificationItem {
  id: number;
  type: NotificationType;
  data: { changed?: string[]; snippet?: string } | null;
  read_at: string | null;
  created_at: string;
  band_slug: string | null;
  band_name: string | null;
  show_id: string | null;
  show_title: string | null;
  show_date: string | null;
  venue_name: string | null;
  // 'new_message' fields — resolved from the conversation. conv_recipient_type
  // is null for every other notification type. conv_viewer_is_initiator marks
  // whether THIS recipient is the human who started the thread (they see "from
  // {band/musician}") vs. on the recipient side (they see "{initiator} messaged
  // {band/musician}").
  conversation_id: string | null;
  conv_recipient_type: RecipientTypeLabel | null;
  conv_band_name: string | null;
  conv_musician_name: string | null;
  conv_initiator_name: string | null;
  conv_initiator_username: string | null;
  conv_viewer_is_initiator: boolean;
}

// Mirror of lib/messaging RecipientType, redeclared to avoid a lib→lib import
// cycle (messaging imports notifications for the fan-out).
type RecipientTypeLabel = "band" | "musician";

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
      shows.venue_name  as venue_name,
      notifications.conversation_id,
      conv.recipient_type as conv_recipient_type,
      conv_band.name      as conv_band_name,
      conv_musician.name  as conv_musician_name,
      conv_initiator.name     as conv_initiator_name,
      conv_initiator.username as conv_initiator_username,
      (conv_viewer.user_id is not null) as conv_viewer_is_initiator
    from notifications
    left join bands on bands.id = notifications.band_id
    left join shows on shows.id = notifications.show_id
    left join conversations conv on conv.id = notifications.conversation_id
    left join bands conv_band
      on conv.recipient_type = 'band' and conv_band.id = conv.recipient_id
    left join musicians conv_musician
      on conv.recipient_type = 'musician' and conv_musician.id = conv.recipient_id
    left join lateral (
      select u.name, u.username
      from conversation_participants p
      join users u on u.id = p.user_id
      where p.conversation_id = conv.id
      order by p.created_at asc
      limit 1
    ) conv_initiator on true
    left join conversation_participants conv_viewer
      on conv_viewer.conversation_id = conv.id
      and conv_viewer.user_id = notifications.user_id
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
