// Following a band — the heart. One concept covering what used to be two:
// saved_bands (a public bookmark) was merged into band_follows in migration
// 0028, so a heart now both lists the band on your profile AND subscribes you
// to its notifications (lib/notifications.ts fans out over this table).
// Schema originally from migration 0018.

import { sql } from "./db.ts";

export interface FollowedBand {
  band_id: number;
  slug: string;
  name: string;
  photo: string | null;
  thumbnail_url: string | null;
  city: string | null;
  followed_at: string;
}

// Idempotent — following a band the user already follows is a no-op, not an error.
export async function followBand(userId: number, bandId: number): Promise<void> {
  await sql`
    insert into band_follows (user_id, band_id)
    values (${userId}, ${bandId})
    on conflict (user_id, band_id) do nothing
  `;
}

// Unfollowing a band that isn't followed is a no-op, not an error.
export async function unfollowBand(userId: number, bandId: number): Promise<void> {
  await sql`
    delete from band_follows where user_id = ${userId} and band_id = ${bandId}
  `;
}

export async function isBandFollowing(userId: number, bandId: number): Promise<boolean> {
  const [row] = await sql`
    select 1 from band_follows where user_id = ${userId} and band_id = ${bandId} limit 1
  `;
  return !!row;
}

/** Just the slugs a user follows, for rendering heart state across a whole
 * list of bands (the directory grid) without a query per card. */
export async function listFollowedSlugs(userId: number): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    select bands.slug
    from band_follows
    join bands on bands.id = band_follows.band_id
    where band_follows.user_id = ${userId}
  `;
  return rows.map((r) => r.slug);
}

// Newest-followed first, for the "Bands you follow" profile section.
export async function listFollowedBands(userId: number): Promise<FollowedBand[]> {
  return sql<FollowedBand[]>`
    select
      bands.id as band_id,
      bands.slug,
      bands.name,
      bands.photo,
      bands.thumbnail_url,
      bands.city,
      band_follows.created_at as followed_at
    from band_follows
    join bands on bands.id = band_follows.band_id
    where band_follows.user_id = ${userId}
    order by band_follows.created_at desc
  `;
}
