// Canonical photographer/videographer directory, backing /photo-video.
// Raw-SQL data layer over the `media_pros` table (migration 0031), mirroring
// lib/venues.ts's shape (a simple, fully-public directory) with bands-style
// self-editing bolted on (lib/mediaProEditors.ts, lib/mediaProClaims.ts).

import { sql } from "./db.ts";
import type postgres from "postgres";
import { slugify, type MediaProRole } from "./mediaProUtils.ts";

export { slugify };

// Mirrors the `media_pros` columns exactly (snake_case), so a `select *` row
// IS a MediaPro with no transform.
export interface MediaPro {
  id: number;
  slug: string;
  name: string;
  role: MediaProRole;
  bio: string | null;
  city: string | null;
  website: string | null;
  instagram: string | null;
  contact: string | null;
  portfolio_url: string | null;
  photo: string | null;
  thumbnail_url: string | null;
  gallery: string[];
  created_at: string;
  updated_at: string;
}

export async function getAllMediaPros(): Promise<MediaPro[]> {
  return sql<MediaPro[]>`select * from media_pros order by name asc`;
}

export async function getMediaProBySlug(slug: string): Promise<MediaPro | null> {
  const [row] = await sql<MediaPro[]>`select * from media_pros where slug = ${slug} limit 1`;
  return row ?? null;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from media_pros where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface MediaProSubmissionInput {
  name: string;
  role: MediaProRole;
  bio: string;
  city: string;
  website: string;
  instagram: string;
  contact: string;
  portfolioUrl: string;
  photoUrl?: string; // set when a new photo was just uploaded (lib/r2.ts)
  thumbnailUrl?: string;
  removePhoto?: boolean;
  galleryUrls: string[]; // full desired gallery (kept + newly uploaded), always sent
}

export interface UpsertMediaProResult {
  mediaPro: MediaPro;
  action: "created" | "updated";
}

/**
 * Create or update a media pro from the public submit/correct form. `mode:
 * "correct"` looks the row up by `existingSlug` and updates it in place;
 * `mode: "add"` generates a fresh unique slug from the name. Runs in a
 * transaction so the lookup/slug-generation/write can't race a concurrent
 * submission — mirrors lib/bands.ts's upsertBand.
 */
export async function upsertMediaPro(
  input: MediaProSubmissionInput,
  mode: "add" | "correct",
  existingSlug?: string,
): Promise<UpsertMediaProResult> {
  return sql.begin(async (tx) => {
    const existing =
      mode === "correct" && existingSlug
        ? ((await tx<MediaPro[]>`select * from media_pros where slug = ${existingSlug} limit 1`)[0] ?? null)
        : null;

    let photo = existing?.photo ?? null;
    let thumbnailUrl = existing?.thumbnail_url ?? null;
    if (input.removePhoto) {
      photo = null;
      thumbnailUrl = null;
    }
    if (input.photoUrl) photo = input.photoUrl;
    if (input.thumbnailUrl) thumbnailUrl = input.thumbnailUrl;

    if (existing) {
      const [updated] = await tx<MediaPro[]>`
        update media_pros set
          name = ${input.name},
          role = ${input.role},
          bio = ${input.bio || null},
          city = ${input.city || null},
          website = ${input.website || null},
          instagram = ${input.instagram || null},
          contact = ${input.contact || null},
          portfolio_url = ${input.portfolioUrl || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          gallery = ${input.galleryUrls},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { mediaPro: updated, action: "updated" as const };
    }

    const slug = await uniqueSlug(tx, slugify(input.name) || "media-pro");
    const [created] = await tx<MediaPro[]>`
      insert into media_pros (
        slug, name, role, bio, city, website, instagram, contact,
        portfolio_url, photo, thumbnail_url, gallery
      ) values (
        ${slug}, ${input.name}, ${input.role}, ${input.bio || null}, ${input.city || null},
        ${input.website || null}, ${input.instagram || null}, ${input.contact || null},
        ${input.portfolioUrl || null}, ${photo}, ${thumbnailUrl}, ${input.galleryUrls}
      )
      returning *
    `;
    return { mediaPro: created, action: "created" as const };
  });
}
