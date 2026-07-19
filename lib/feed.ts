// The site-wide feed (app/feed). A union of item kinds — statuses and band
// follows today — so future sources (new bands, shows added, videos) merge in
// without reworking the page: add a `FeedItem` variant, add a loader that
// returns it, and fold that loader into getFeed()'s merge.
//
// PRIVACY: the feed is a public, unauthenticated page, so it must never
// surface anything you couldn't already see by visiting the item's own public
// page. For statuses that means users who are both profile_public AND have a
// username — i.e. exactly the people with a reachable /u/[username] page —
// AND have show_status on, since 0033 lets that section be hidden
// independently of the page as a whole. The same check (profile_public +
// username + show_followed_bands) gates follows, which are listed on that
// page too (migration 0028). Any future item kind needs its own equivalent
// check in its own loader — the rule lives per-loader, not in getFeed().

import { sql } from "./db.ts";

export interface FeedUser {
  username: string;
  name: string | null;
  image_url: string | null;
}

export interface StatusFeedItem {
  kind: "status";
  /** Stable across kinds so React keys don't need per-kind logic. */
  id: string;
  /** What the feed sorts on — newest first. */
  at: string;
  user: FeedUser;
  status: string;
}

export interface FollowFeedItem {
  kind: "follow";
  id: string;
  at: string;
  user: FeedUser;
  /** Up to FOLLOW_BANDS_SHOWN of the bands in this batch, newest first. */
  bands: { slug: string; name: string }[];
  /** How many bands the batch actually covers — may exceed bands.length. */
  total: number;
}

export type FeedItem = StatusFeedItem | FollowFeedItem;

/** How many band names a grouped follow item names before it says "and N
 * others". Enough to be informative, few enough to stay one line. */
const FOLLOW_BANDS_SHOWN = 3;

const DEFAULT_LIMIT = 50;

/** Most recent statuses from users with a public profile page. One row per
 * user — a status is current state, not an event log, so a user appears once
 * with whatever they've got set now. */
async function listStatusItems(limit: number): Promise<StatusFeedItem[]> {
  const rows = await sql<
    { id: number; username: string; name: string | null; image_url: string | null; status: string; status_at: string }[]
  >`
    select id, username, name, image_url, status, status_at
    from users
    where status is not null
      and status_at is not null
      and username is not null
      and profile_public = true
      and show_status = true
    order by status_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    kind: "status" as const,
    id: `status:${row.id}`,
    at: row.status_at,
    user: { username: row.username, name: row.name, image_url: row.image_url },
    status: row.status,
  }));
}

/** Recent follows, grouped per user per hour. A follow is an event, not a
 * state, so an unbatched query would let one person hearting twenty bands in a
 * sitting — exactly what the directory encourages on signup — bury every other
 * item. Grouping makes that land as a single "followed 20 bands" row.
 *
 * The hour bucket is deliberately crude: it splits a long browsing session
 * into a few rows rather than one, which is the harmless failure. The bad
 * failure is twenty rows.
 */
async function listFollowItems(limit: number): Promise<FollowFeedItem[]> {
  const rows = await sql<
    {
      user_id: number;
      username: string;
      name: string | null;
      image_url: string | null;
      at: string;
      bucket: string;
      total: number;
      band_slugs: string[];
      band_names: string[];
    }[]
  >`
    select
      users.id as user_id,
      users.username,
      users.name,
      users.image_url,
      date_trunc('hour', band_follows.created_at) as bucket,
      max(band_follows.created_at) as at,
      count(*)::int as total,
      (array_agg(bands.slug order by band_follows.created_at desc))[1:${FOLLOW_BANDS_SHOWN}] as band_slugs,
      (array_agg(bands.name order by band_follows.created_at desc))[1:${FOLLOW_BANDS_SHOWN}] as band_names
    from band_follows
    join users on users.id = band_follows.user_id
    join bands on bands.id = band_follows.band_id
    where users.username is not null
      and users.profile_public = true
      and users.show_followed_bands = true
    group by users.id, users.username, users.name, users.image_url, bucket
    order by at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    kind: "follow" as const,
    id: `follow:${row.user_id}:${row.bucket}`,
    at: row.at,
    user: { username: row.username, name: row.name, image_url: row.image_url },
    bands: row.band_slugs.map((slug, i) => ({ slug, name: row.band_names[i] })),
    total: row.total,
  }));
}

/** The feed, newest first. Each source is queried with the full limit and the
 * merged result is trimmed, so one chatty source can't crowd the others out of
 * their fair share before sorting. */
export async function getFeed(limit: number = DEFAULT_LIMIT): Promise<FeedItem[]> {
  const [statuses, follows] = await Promise.all([
    listStatusItems(limit),
    listFollowItems(limit),
  ]);

  return [...statuses, ...follows]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
