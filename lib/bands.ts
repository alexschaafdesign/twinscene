// Canonical band directory, served through /api/public/bands. Twin Scene's
// Neon DB is becoming the home for this data (it currently lives on Birdhaus);
// this module is the raw-SQL data layer over the `bands` table.

import { sql } from "./db.ts";
import type postgres from "postgres";
import { resolveBandcampEmbedUrl } from "./bandcamp.ts";
import { extractOgImage } from "./ogImage.ts";

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
  thumbnail_url: string | null; // 400px square variant of `photo` (bands/thumb/<slug>.jpg); null if no photo
  city: string | null;
  neighborhoods: unknown; // jsonb — string[] of finer-grained areas; null if none
  bandcamp_embed_url: string | null; // resolved Bandcamp EmbeddedPlayer URL
  bandcamp_embed_height: number | null; // iframe height in px for that embed
  featured_links: unknown; // jsonb — { url, label, image }[] highlight cards; null if none
  members: unknown; // jsonb — string[] of band member names; null if none
  contact_email: string | null; // not exposed publicly — see PUBLIC_BAND_FIELDS
  contact_method: string | null; // "" | "email" | "instagram" | "website"; not exposed publicly
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
  "thumbnail_url",
  "city",
  "neighborhoods",
  "bandcamp_embed_url",
  "bandcamp_embed_height",
  "featured_links",
  "members",
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

export interface BandCoreFieldsInput {
  name?: string;
  bio?: string;
  genre?: string;
  hometown?: string;
}

// Minimal admin-only edit path — updates just the plain-text core fields,
// skipping the public submit form's photo/embed/featured-link resolution
// pipeline (upsertBand). Exists to prove out the auth gate (lib/auth.ts
// canEditBand) end to end; a fuller admin editing UI is later scope.
export async function updateBandCoreFields(
  bandId: number,
  input: BandCoreFieldsInput,
): Promise<Band> {
  const current = await sql<Band[]>`select * from bands where id = ${bandId} limit 1`;
  const existing = current[0];
  if (!existing) throw new Error(`updateBandCoreFields: no band with id ${bandId}`);

  const [updated] = await sql<Band[]>`
    update bands set
      name = ${input.name ?? existing.name},
      bio = ${input.bio ?? existing.bio},
      genre = ${input.genre ?? existing.genre},
      hometown = ${input.hometown ?? existing.hometown},
      updated_at = now()
    where id = ${bandId}
    returning *
  `;
  return updated;
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

// --- Write path for the "Add your band" / "Edit this band" form -----------
// Replaces the legacy Apps Script webhook (apps-script/Code.js), which wrote
// into a Google Sheet that nothing reads anymore once fetchBands() cut over
// to this table. Mirrors the enrichment that webhook used to do server-side
// (Bandcamp embed resolution, featured-link og:image scraping) so submitting
// a band here has the same effect it always visually appeared to have.

type FeaturedLinkInput = { url: string; label: string };
type FeaturedLink = { url: string; label: string; image: string };

export interface BandSubmissionInput {
  name: string;
  genres: string[];
  city: string;
  neighborhoods: string[];
  members: string[];
  contactEmail: string;
  contactMethod: string;
  website: string;
  instagram: string;
  bandcamp: string; // raw URL or a pasted <iframe> embed snippet
  bandcampLink: string; // plain Bandcamp profile link, shown as a social icon
  bio: string;
  featuredLinks: FeaturedLinkInput[];
  photoUrl?: string; // set when a new photo was just uploaded (lib/r2.ts)
  thumbnailUrl?: string; // 400px thumbnail generated alongside a new photoUrl
  removePhoto?: boolean;
}

export interface UpsertBandResult {
  band: Band;
  action: "created" | "updated";
}

function socialsOf(v: unknown): { instagram: string; website: string; bandcamp: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  return { instagram: str(o.instagram), website: str(o.website), bandcamp: str(o.bandcamp) };
}

function featuredLinksOf(v: unknown): FeaturedLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      url: typeof l.url === "string" ? l.url : "",
      label: typeof l.label === "string" ? l.label : "",
      image: typeof l.image === "string" ? l.image : "",
    }))
    .filter((l) => l.url);
}

function socialsJson(input: {
  website: string;
  instagram: string;
  bandcamp: string;
  bandcampLink: string;
}): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (input.website.trim()) out.website = input.website.trim();
  if (input.instagram.trim()) out.instagram = input.instagram.trim();
  if (input.bandcamp.trim()) out.bandcamp = input.bandcamp.trim();
  if (input.bandcampLink.trim()) out.bandcampLink = input.bandcampLink.trim();
  return Object.keys(out).length ? out : null;
}

// Fetches an og:image for each new featured link, reusing the previously
// stored image when its URL is unchanged (avoids a network fetch on every
// unrelated edit) — mirrors featuredLinksFor_ in apps-script/Code.js.
async function resolveFeaturedLinks(
  links: FeaturedLinkInput[],
  oldLinks: FeaturedLink[],
): Promise<FeaturedLink[] | null> {
  const filled = links.filter((l) => l.url.trim());
  if (filled.length === 0) return null;

  const oldImageByUrl = new Map(oldLinks.map((l) => [l.url, l.image]));
  const resolved = await Promise.all(
    filled.map(async (l) => {
      const url = l.url.trim();
      const image = oldImageByUrl.get(url) || (await extractOgImage(url));
      return { url, label: l.label.trim(), image: image || "" };
    }),
  );
  return resolved;
}

// Resolves the Bandcamp embed for a submission, reusing the stored embed when
// the raw Bandcamp field hasn't changed — mirrors bandcampEmbedFor_ in
// apps-script/Code.js.
async function resolveBandcampEmbed(
  newBandcamp: string,
  oldBandcamp: string,
  oldEmbedUrl: string,
  oldEmbedHeight: number | null,
): Promise<{ embedUrl: string; height: number }> {
  const trimmed = newBandcamp.trim();
  if (!trimmed) return { embedUrl: "", height: 0 };
  if (trimmed === oldBandcamp.trim() && oldEmbedUrl) {
    return { embedUrl: oldEmbedUrl, height: oldEmbedHeight ?? 0 };
  }
  return resolveBandcampEmbedUrl(trimmed);
}

/**
 * Create or update a band from the public submit/correct form. `mode:
 * "correct"` looks the row up by `existingSlug` and updates it in place
 * (the slug itself never changes on a correction, matching the old Apps
 * Script behavior); `mode: "add"` generates a fresh unique slug from the
 * name. Runs in a transaction so the lookup/slug-generation/write can't race
 * a concurrent submission.
 */
export async function upsertBand(
  input: BandSubmissionInput,
  mode: "add" | "correct",
  existingSlug?: string,
): Promise<UpsertBandResult> {
  return sql.begin(async (tx) => {
    const existing =
      mode === "correct" && existingSlug
        ? ((await tx<Band[]>`select * from bands where slug = ${existingSlug} limit 1`)[0] ?? null)
        : null;

    const genre = input.genres.map((g) => g.trim()).filter(Boolean).join(", ") || null;
    const neighborhoods = input.neighborhoods.map((n) => n.trim()).filter(Boolean);
    const members = input.members.map((m) => m.trim()).filter(Boolean);
    const socials = socialsJson(input);

    const featuredLinks = await resolveFeaturedLinks(
      input.featuredLinks,
      featuredLinksOf(existing?.featured_links),
    );
    const embed = await resolveBandcampEmbed(
      input.bandcamp,
      socialsOf(existing?.socials).bandcamp,
      existing?.bandcamp_embed_url ?? "",
      existing?.bandcamp_embed_height ?? null,
    );

    // Thumbnail tracks the photo one-for-one: cleared when the photo is
    // removed, replaced when a new photo (and its freshly generated thumbnail)
    // comes in, otherwise left as-is.
    let photo = existing?.photo ?? null;
    let thumbnailUrl = existing?.thumbnail_url ?? null;
    if (input.removePhoto) {
      photo = null;
      thumbnailUrl = null;
    }
    if (input.photoUrl) photo = input.photoUrl;
    if (input.thumbnailUrl) thumbnailUrl = input.thumbnailUrl;

    if (existing) {
      const [updated] = await tx<Band[]>`
        update bands set
          name = ${input.name},
          genre = ${genre},
          socials = ${socials ? sql.json(socials) : null},
          bio = ${input.bio || null},
          city = ${input.city || null},
          neighborhoods = ${neighborhoods.length ? sql.json(neighborhoods) : null},
          members = ${members.length ? sql.json(members) : null},
          contact_email = ${input.contactEmail || null},
          contact_method = ${input.contactMethod || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          bandcamp_embed_url = ${embed.embedUrl || null},
          bandcamp_embed_height = ${embed.height || null},
          featured_links = ${featuredLinks ? sql.json(featuredLinks) : null},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { band: updated, action: "updated" as const };
    }

    const slug = await uniqueSlug(tx, slugify(input.name) || "band");
    const [created] = await tx<Band[]>`
      insert into bands (
        slug, name, genre, socials, bio, city, neighborhoods, members,
        contact_email, contact_method, photo, thumbnail_url, bandcamp_embed_url,
        bandcamp_embed_height, featured_links
      ) values (
        ${slug}, ${input.name}, ${genre}, ${socials ? sql.json(socials) : null},
        ${input.bio || null}, ${input.city || null},
        ${neighborhoods.length ? sql.json(neighborhoods) : null},
        ${members.length ? sql.json(members) : null}, ${input.contactEmail || null},
        ${input.contactMethod || null}, ${photo}, ${thumbnailUrl}, ${embed.embedUrl || null},
        ${embed.height || null}, ${featuredLinks ? sql.json(featuredLinks) : null}
      )
      returning *
    `;
    return { band: created, action: "created" as const };
  });
}
