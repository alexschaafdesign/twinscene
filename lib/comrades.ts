// Canonical directory of scene participants who aren't bands, musicians, or
// writers — recording studios, record labels, rehearsal spaces, photographers
// and videographers, and the like — backing /comrades. Raw-SQL data layer over
// the `comrades` table (migration 0064; photo/video merged in via 0065, which
// absorbed the retired standalone media_pros directory), with bands-style
// self-editing bolted on (lib/comradeEditors.ts, lib/comradeClaims.ts).

import { sql } from "./db.ts";
import type postgres from "postgres";
import { slugify, type ComradeCategory } from "./comradeUtils.ts";

export { slugify };

// Mirrors the `comrades` columns exactly (snake_case), so a `select *` row
// IS a Comrade with no transform.
export interface Comrade {
  id: number;
  slug: string;
  name: string;
  category: ComradeCategory;
  tagline: string | null;
  bio: string | null;
  city: string | null;
  website: string | null;
  instagram: string | null;
  contact: string | null;
  portfolio_url: string | null;
  photo: string | null;
  thumbnail_url: string | null;
  // Up to 5 work samples — only ever populated for the `photo_video` category
  // (folded in from the retired media_pros directory). Other categories leave
  // it empty; the profile only renders a gallery when it's non-empty.
  gallery: string[];
  created_at: string;
  updated_at: string;
}

export async function getAllComrades(): Promise<Comrade[]> {
  return sql<Comrade[]>`select * from comrades order by name asc`;
}

export async function getComradesByCategory(category: ComradeCategory): Promise<Comrade[]> {
  return sql<Comrade[]>`select * from comrades where category = ${category} order by name asc`;
}

export async function getComradeBySlug(slug: string): Promise<Comrade | null> {
  const [row] = await sql<Comrade[]>`select * from comrades where slug = ${slug} limit 1`;
  return row ?? null;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from comrades where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface ComradeSubmissionInput {
  name: string;
  category: ComradeCategory;
  tagline: string;
  bio: string;
  city: string;
  website: string;
  instagram: string;
  contact: string;
  portfolioUrl: string;
  photoUrl?: string; // set when a new photo was just uploaded (lib/r2.ts)
  thumbnailUrl?: string;
  removePhoto?: boolean;
  // Final gallery URLs to persist (kept-existing + newly-uploaded), already
  // resolved by the submit route. Omitted for non-photo/video submissions.
  galleryUrls?: string[];
}

export interface UpsertComradeResult {
  comrade: Comrade;
  action: "created" | "updated";
}

/**
 * Create or update a comrade from the public submit/correct form. `mode:
 * "correct"` looks the row up by `existingSlug` and updates it in place;
 * `mode: "add"` generates a fresh unique slug from the name. Runs in a
 * transaction so the lookup/slug-generation/write can't race a concurrent
 * submission — mirrors lib/mediaPros.ts's upsertMediaPro.
 */
export async function upsertComrade(
  input: ComradeSubmissionInput,
  mode: "add" | "correct",
  existingSlug?: string,
): Promise<UpsertComradeResult> {
  return sql.begin(async (tx) => {
    const existing =
      mode === "correct" && existingSlug
        ? ((await tx<Comrade[]>`select * from comrades where slug = ${existingSlug} limit 1`)[0] ?? null)
        : null;

    let photo = existing?.photo ?? null;
    let thumbnailUrl = existing?.thumbnail_url ?? null;
    if (input.removePhoto) {
      photo = null;
      thumbnailUrl = null;
    }
    if (input.photoUrl) photo = input.photoUrl;
    if (input.thumbnailUrl) thumbnailUrl = input.thumbnailUrl;

    // Gallery only applies to photo/video listings; when the caller doesn't
    // send one (every other category), preserve whatever's there on update and
    // default to empty on insert.
    const gallery = input.galleryUrls ?? existing?.gallery ?? [];

    if (existing) {
      const [updated] = await tx<Comrade[]>`
        update comrades set
          name = ${input.name},
          category = ${input.category},
          tagline = ${input.tagline || null},
          bio = ${input.bio || null},
          city = ${input.city || null},
          website = ${input.website || null},
          instagram = ${input.instagram || null},
          contact = ${input.contact || null},
          portfolio_url = ${input.portfolioUrl || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          gallery = ${gallery},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { comrade: updated, action: "updated" as const };
    }

    const slug = await uniqueSlug(tx, slugify(input.name) || "comrade");
    const [created] = await tx<Comrade[]>`
      insert into comrades (
        slug, name, category, tagline, bio, city, website, instagram, contact,
        portfolio_url, photo, thumbnail_url, gallery
      ) values (
        ${slug}, ${input.name}, ${input.category}, ${input.tagline || null}, ${input.bio || null},
        ${input.city || null}, ${input.website || null}, ${input.instagram || null},
        ${input.contact || null}, ${input.portfolioUrl || null}, ${photo}, ${thumbnailUrl}, ${gallery}
      )
      returning *
    `;
    return { comrade: created, action: "created" as const };
  });
}
