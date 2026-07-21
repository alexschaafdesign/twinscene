// Canonical venue directory, served through /api/public/venues. Twin Scene's
// Neon DB is the home for this data (it used to live in a public Google
// Sheet, read live as CSV — see the dead code kept at the bottom of
// lib/fetchVenues.ts). Raw-SQL data layer over the `venues` table, mirroring
// lib/bands.ts's shape. Unlike bands, every column here is public — there's
// no restricted field like `contact_email` to allowlist away.

import { sql } from "./db.ts";
import { slugify } from "./venueUtils.ts";
import { geocodeAddress } from "./geocode.ts";

export { slugify };

// Mirrors the `venues` columns exactly (snake_case), so a `select *` row IS a
// Venue with no transform.
export interface Venue {
  id: number;
  slug: string;
  name: string;
  address: string | null; // street address, e.g. "416 N 1st Ave"; null when private/unknown
  address_private: boolean; // DIY venue: address withheld, "DM venue for address"
  manual_scrape: boolean; // no auto-scraper — shows must be entered by hand
  city: string | null;
  neighborhood: string | null;
  // Geocoded from `address` on upsert (free US Census geocoder); null when the
  // address is private/unknown or geocoding failed. Powers the venue map.
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  contact: string | null;
  notes: string | null;
  parking: string | null;
  accessibility: string | null;
  owner: string | null;
  type: string | null;
  photo: string | null; // full absolute URL (R2), venues/<slug>.<ext>; null if none
  thumbnail_url: string | null; // 400px square variant of `photo`; null if no photo
  short_name: string | null; // display name for grid cards, e.g. "The Cedar"; falls back to `name`
  avatar_initials: string | null; // usually 2-3 letters for VenueAvatar, but a short word fits too; falls back to an auto-derive from `name`
  created_at: string;
  updated_at: string;
}

// Alphabetized case-insensitively and ignoring a leading "The " so "The
// Cedar" files under C, "The Turf Club" under T(urf) rather than under T(he)
// — mirrors app/shows/submit/page.tsx's venueSortKey for its venue picker.
export async function getAllVenues(): Promise<Venue[]> {
  return sql<Venue[]>`
    select * from venues
    order by lower(regexp_replace(name, '^the\s+', '', 'i')) asc
  `;
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const [row] = await sql<Venue[]>`select * from venues where slug = ${slug} limit 1`;
  return row ?? null;
}

export interface VenueSubmissionInput {
  name: string;
  address: string;
  addressPrivate: boolean;
  manualScrape: boolean;
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
  shortName: string;
  avatarInitials: string;
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

  // A private-address venue stores no address, regardless of what was typed.
  const address = input.addressPrivate ? null : input.address || null;

  // Resolve coordinates OUTSIDE the transaction — geocoding hits the Census
  // service (up to ~8s) and we must never hold a DB transaction open on a slow
  // network call. Reuse the stored coords when the address is unchanged;
  // re-geocode only when it changed or we never had coords. If geocoding fails
  // we fall back to whatever we had rather than wiping good data.
  let lat: number | null = null;
  let lng: number | null = null;
  if (address) {
    const [prior] = await sql<
      { address: string | null; lat: number | null; lng: number | null }[]
    >`select address, lat, lng from venues where slug = ${targetSlug} limit 1`;
    if (prior && prior.address === address && prior.lat != null && prior.lng != null) {
      lat = prior.lat;
      lng = prior.lng;
    } else {
      const point = await geocodeAddress(address, input.city || undefined);
      lat = point?.lat ?? prior?.lat ?? null;
      lng = point?.lng ?? prior?.lng ?? null;
    }
  }

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
          address = ${address},
          address_private = ${input.addressPrivate},
          manual_scrape = ${input.manualScrape},
          city = ${input.city || null},
          neighborhood = ${input.neighborhood || null},
          lat = ${lat},
          lng = ${lng},
          capacity = ${input.capacity},
          contact = ${input.contact || null},
          notes = ${input.notes || null},
          parking = ${input.parking || null},
          accessibility = ${input.accessibility || null},
          owner = ${input.owner || null},
          type = ${input.type || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          short_name = ${input.shortName || null},
          avatar_initials = ${input.avatarInitials || null},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { venue: updated, action: "updated" as const };
    }

    const [created] = await tx<Venue[]>`
      insert into venues (
        slug, name, address, address_private, manual_scrape, city, neighborhood, lat, lng, capacity, contact, notes, parking,
        accessibility, owner, type, photo, thumbnail_url, short_name, avatar_initials
      ) values (
        ${targetSlug}, ${input.name}, ${address}, ${input.addressPrivate}, ${input.manualScrape}, ${input.city || null}, ${input.neighborhood || null},
        ${lat}, ${lng},
        ${input.capacity}, ${input.contact || null}, ${input.notes || null},
        ${input.parking || null}, ${input.accessibility || null}, ${input.owner || null},
        ${input.type || null}, ${photo}, ${thumbnailUrl}, ${input.shortName || null}, ${input.avatarInitials || null}
      )
      returning *
    `;
    return { venue: created, action: "created" as const };
  });
}
