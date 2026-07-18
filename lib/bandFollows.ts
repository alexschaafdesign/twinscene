// Slice 2 of Phase 3 (user collections): following bands. Distinct from
// saved_bands (a bookmark) — a follow means "keep up with this band" and will
// drive a feed/notifications later. See migration 0018 for the schema.

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
