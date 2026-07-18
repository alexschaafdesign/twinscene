// Slice 1 of Phase 3 (user collections): saving/unsaving bands. See migration
// 0018 for the schema — band_follows and show_saves exist alongside
// saved_bands but aren't wired up to any code yet.

import { sql } from "./db.ts";

export interface SavedBand {
  band_id: number;
  slug: string;
  name: string;
  photo: string | null;
  thumbnail_url: string | null;
  city: string | null;
  saved_at: string;
}

// Idempotent — re-saving a band the user already saved is a no-op, not an error.
export async function saveBand(userId: number, bandId: number): Promise<void> {
  await sql`
    insert into saved_bands (user_id, band_id)
    values (${userId}, ${bandId})
    on conflict (user_id, band_id) do nothing
  `;
}

// Unsaving a band that isn't saved is a no-op, not an error.
export async function unsaveBand(userId: number, bandId: number): Promise<void> {
  await sql`
    delete from saved_bands where user_id = ${userId} and band_id = ${bandId}
  `;
}

export async function isBandSaved(userId: number, bandId: number): Promise<boolean> {
  const [row] = await sql`
    select 1 from saved_bands where user_id = ${userId} and band_id = ${bandId} limit 1
  `;
  return !!row;
}

// Newest-saved first, for the "My saved bands" profile page.
export async function listSavedBands(userId: number): Promise<SavedBand[]> {
  return sql<SavedBand[]>`
    select
      bands.id as band_id,
      bands.slug,
      bands.name,
      bands.photo,
      bands.thumbnail_url,
      bands.city,
      saved_bands.created_at as saved_at
    from saved_bands
    join bands on bands.id = saved_bands.band_id
    where saved_bands.user_id = ${userId}
    order by saved_bands.created_at desc
  `;
}
