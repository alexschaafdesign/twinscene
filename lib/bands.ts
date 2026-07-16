// Canonical band directory, served through /api/public/bands. Twin Scene's
// Neon DB is becoming the home for this data (it currently lives on Birdhaus);
// this module is the raw-SQL data layer over the `bands` table.

import { sql } from "./db.ts";
import type postgres from "postgres";

// Mirrors the `bands` columns exactly (snake_case), so a `select *` row IS a
// Band with no transform. The public allowlist below is keyed off this type, so
// the column names here are the field names the API can expose.
export interface Band {
  id: number;
  slug: string;
  name: string;
  unreviewed: boolean;
  genre: string | null;
  socials: unknown; // jsonb — arbitrary { platform: url } shape, not modeled yet
  bio: string | null;
  hometown: string | null;
  photo: string | null; // full absolute URL (Birdhaus image host); null if none
  city: string | null;
  neighborhoods: unknown; // jsonb — string[] of finer-grained areas; null if none
  bandcamp_embed_url: string | null; // resolved Bandcamp EmbeddedPlayer URL
  bandcamp_embed_height: number | null; // iframe height in px for that embed
  featured_links: unknown; // jsonb — { url, label, image }[] highlight cards; null if none
  created_at: string;
  updated_at: string;
}

// Explicit public allowlist. A new column added to `bands` later is NOT exposed
// through the API until it's added here on purpose. Mirrors Birdhaus's
// public-bands endpoint: an `as const` tuple, a compile-time `keyof Band` check,
// and a Pick-typed projection.
export const PUBLIC_BAND_FIELDS = [
  "id",
  "slug",
  "name",
  "unreviewed",
  "genre",
  "socials",
  "bio",
  "hometown",
  "photo",
  "city",
  "neighborhoods",
  "bandcamp_embed_url",
  "bandcamp_embed_height",
  "featured_links",
  "created_at",
  "updated_at",
] as const;

// Fails to compile if a typo'd or renamed field above no longer exists on Band.
const _publicFieldsAreValid: ReadonlyArray<keyof Band> = PUBLIC_BAND_FIELDS;
void _publicFieldsAreValid;

export type PublicBand = Pick<Band, (typeof PUBLIC_BAND_FIELDS)[number]>;

// Projects a full row down to the allowlisted fields — the only shape that ever
// leaves the API, so nothing outside PUBLIC_BAND_FIELDS can leak.
export function toPublicBand(band: Band): PublicBand {
  const result = {} as PublicBand;
  for (const field of PUBLIC_BAND_FIELDS) {
    (result as Record<string, unknown>)[field] = band[field];
  }
  return result;
}

// Mirrors Birdhaus's slugify() so the same name yields the same slug on both
// sides of the (eventual) migration.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getAllBands(): Promise<Band[]> {
  return sql<Band[]>`select * from bands order by name asc`;
}

export async function getBandBySlug(slug: string): Promise<Band | null> {
  const [row] = await sql<Band[]>`select * from bands where slug = ${slug} limit 1`;
  return row ?? null;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from bands where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface FindOrCreateResult {
  band: Band;
  matched: boolean;
}

// Case-insensitive lookup by name; creates a new unreviewed band when there's
// no match. Runs in a transaction so the existence check, slug generation, and
// insert can't race against a concurrent create of the same name.
export async function findOrCreateBandByName(name: string): Promise<FindOrCreateResult> {
  return sql.begin(async (tx) => {
    const [existing] = await tx<Band[]>`
      select * from bands where lower(name) = lower(${name}) limit 1
    `;
    if (existing) return { band: existing, matched: true };

    const slug = await uniqueSlug(tx, slugify(name) || "band");
    const [created] = await tx<Band[]>`
      insert into bands (slug, name, unreviewed)
      values (${slug}, ${name}, true)
      returning *
    `;
    return { band: created, matched: false };
  });
}
