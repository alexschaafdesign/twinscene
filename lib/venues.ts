// Canonical venue directory, served through /api/public/venues. Twin Scene's
// Neon DB is the home for this data (it used to live in a public Google
// Sheet, read live as CSV — see the dead code kept at the bottom of
// lib/fetchVenues.ts). Raw-SQL data layer over the `venues` table, mirroring
// lib/bands.ts's shape. Unlike bands, every column here is public — there's
// no restricted field like `contact_email` to allowlist away.

import { sql } from "./db.ts";
import { slugify } from "./venueUtils.ts";

export { slugify };

// Mirrors the `venues` columns exactly (snake_case), so a `select *` row IS a
// Venue with no transform.
export interface Venue {
  id: number;
  slug: string;
  name: string;
  city: string | null;
  neighborhood: string | null;
  capacity: number | null;
  contact: string | null;
  notes: string | null;
  parking: string | null;
  accessibility: string | null;
  owner: string | null;
  type: string | null;
  photo: string | null; // full absolute URL (R2), venues/<slug>.<ext>; null if none
  thumbnail_url: string | null; // 400px square variant of `photo`; null if no photo
  created_at: string;
  updated_at: string;
}

export async function getAllVenues(): Promise<Venue[]> {
  return sql<Venue[]>`select * from venues order by name asc`;
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const [row] = await sql<Venue[]>`select * from venues where slug = ${slug} limit 1`;
  return row ?? null;
}

export interface VenueSubmissionInput {
  name: string;
  city: string;
  neighborhood: string;
  capacity: number | null;
  contact: string;
  notes: string;
  parking: string;
  accessibility: string;
  owner: string;
  type: string;
  photoUrl?: string; // set when a new photo was just uploaded (lib/r2.ts)
  thumbnailUrl?: string; // 400px thumbnail generated alongside a new photoUrl
  removePhoto?: boolean;
}

type UpsertVenueResult = { venue: Venue; action: "created" | "updated" };

// Replicates the sheet-era Apps Script upsert-by-slug semantics
// (handleVenueSubmission_ in apps-script/Code.js): the target slug is the
// existing venue's slug when correcting, otherwise a fresh slug from the
// name; if a venue already exists at that slug, this updates it in place
// (the slug column itself is left untouched, matching the old sheet
// behavior — a name change shouldn't break the permalink); otherwise it
// inserts a new row.
export async function upsertVenue(
  input: VenueSubmissionInput,
  mode: "add" | "correct",
  existingSlug?: string,
): Promise<UpsertVenueResult> {
  const targetSlug = mode === "correct" && existingSlug ? existingSlug : slugify(input.name);

  return sql.begin(async (tx) => {
    const [existing] = await tx<Venue[]>`select * from venues where slug = ${targetSlug} limit 1`;

    // Thumbnail tracks the photo one-for-one: cleared when the photo is
    // removed, replaced when a new photo (and its freshly generated
    // thumbnail) comes in, otherwise left as-is. Mirrors upsertBand.
    let photo = existing?.photo ?? null;
    let thumbnailUrl = existing?.thumbnail_url ?? null;
    if (input.removePhoto) {
      photo = null;
      thumbnailUrl = null;
    }
    if (input.photoUrl) photo = input.photoUrl;
    if (input.thumbnailUrl) thumbnailUrl = input.thumbnailUrl;

    if (existing) {
      const [updated] = await tx<Venue[]>`
        update venues set
          name = ${input.name},
          city = ${input.city || null},
          neighborhood = ${input.neighborhood || null},
          capacity = ${input.capacity},
          contact = ${input.contact || null},
          notes = ${input.notes || null},
          parking = ${input.parking || null},
          accessibility = ${input.accessibility || null},
          owner = ${input.owner || null},
          type = ${input.type || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { venue: updated, action: "updated" as const };
    }

    const [created] = await tx<Venue[]>`
      insert into venues (
        slug, name, city, neighborhood, capacity, contact, notes, parking,
        accessibility, owner, type, photo, thumbnail_url
      ) values (
        ${targetSlug}, ${input.name}, ${input.city || null}, ${input.neighborhood || null},
        ${input.capacity}, ${input.contact || null}, ${input.notes || null},
        ${input.parking || null}, ${input.accessibility || null}, ${input.owner || null},
        ${input.type || null}, ${photo}, ${thumbnailUrl}
      )
      returning *
    `;
    return { venue: created, action: "created" as const };
  });
}
