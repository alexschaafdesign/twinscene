// The site-wide feed (app/feed). Today it's only user statuses, but it's
// shaped as a union of item kinds so future sources — new bands, shows added,
// videos, follows — can be merged in without reworking the page: add a
// `FeedItem` variant, add a loader that returns it, and fold that loader into
// getFeed()'s merge.
//
// PRIVACY: the feed is a public, unauthenticated page, so it must never
// surface anything you couldn't already see by visiting the item's own public
// page. For statuses that means users who are both profile_public AND have a
// username — i.e. exactly the people with a reachable /u/[username] page.
// Any future item kind needs its own equivalent check in its own loader.

import { sql } from "./db.ts";

export interface StatusFeedItem {
  kind: "status";
  /** Stable across kinds so React keys don't need per-kind logic. */
  id: string;
  /** What the feed sorts on — newest first. */
  at: string;
  user: {
    username: string;
    name: string | null;
    image_url: string | null;
  };
  status: string;
}

export type FeedItem = StatusFeedItem;

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

/** The feed, newest first. Each source is queried with the full limit and the
 * merged result is trimmed, so one chatty source can't crowd the others out of
 * their fair share before sorting. */
export async function getFeed(limit: number = DEFAULT_LIMIT): Promise<FeedItem[]> {
  const [statuses] = await Promise.all([listStatusItems(limit)]);

  return [...statuses]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
