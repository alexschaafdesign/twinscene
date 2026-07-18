// Data layer for the `musicians` + `band_members` tables (migration 0021).
// Replaces the old string-derived musician grouping: `bands.members` (jsonb
// string[]) stays as a frozen backup, kept in sync by lib/bands.ts's
// upsertBand via reconcileBandMembers below, but musicians and their band
// links are now real rows with stable ids/slugs.

import { sql } from "./db.ts";
import type postgres from "postgres";
import { slugify } from "./bands.ts";
import type { User } from "./auth.ts";

export interface Musician {
  id: number;
  name: string;
  slug: string;
  user_id: number | null;
  bio: string | null;
  image_url: string | null;
  created_at: string;
}

export interface BandMusician {
  id: number;
  name: string;
  slug: string;
}

export interface MusicianEntry {
  id: number;
  name: string;
  slug: string;
  bands: { name: string; slug: string }[];
}

type Tx = postgres.TransactionSql;

async function uniqueMusicianSlug(tx: Tx | typeof sql, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from musicians where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function getMusicianBySlug(slug: string): Promise<Musician | null> {
  const [row] = await sql<Musician[]>`select * from musicians where slug = ${slug} limit 1`;
  return row ?? null;
}

// The musician linked to `userId` (Slice 2's musicians.user_id), plus the
// bands that link grants edit access to — for display on /profile. Null if
// the user has no linked musician yet.
export async function getMusicianForUser(
  userId: number,
): Promise<(Musician & { bands: { name: string; slug: string }[] }) | null> {
  const [musician] = await sql<Musician[]>`
    select * from musicians where user_id = ${userId} limit 1
  `;
  if (!musician) return null;

  const bands = await sql<{ name: string; slug: string }[]>`
    select bands.name, bands.slug
    from band_members
    join bands on bands.id = band_members.band_id
    where band_members.musician_id = ${musician.id}
    order by bands.name asc
  `;
  return { ...musician, bands };
}

// The single rule for "can this user edit this musician's profile" — mirrors
// canEditBand in lib/auth.ts. Unlike band editing (many editors per band via
// band_editors), a musician has at most one linked user (musicians.user_id,
// unique), so this is a direct column check rather than a join table.
export async function canEditMusician(user: User | null, musicianId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from musicians where id = ${musicianId} and user_id = ${user.id} limit 1
  `;
  return !!row;
}

// Named distinctly from the pre-existing MusicianNameMatch below (the
// createMusicianForUser "an existing musician already has this name"
// result) — this one is a *list* of onboarding suggestions, not a
// dedupe-on-create signal.
export interface MusicianNameSuggestion {
  id: number;
  name: string;
  slug: string;
  bands: { name: string; slug: string }[];
}

// Onboarding suggestion for /profile/musician: musicians whose name matches
// `name` case-insensitively, restricted to ones `userId` could plausibly
// claim — unlinked (user_id is null) or already linked to `userId` itself.
// Deliberately excludes musicians linked to a DIFFERENT user, since those
// can never be claimed regardless of the name match. This only powers a
// suggestion ("is this you?") — it never links or blocks anything; a second,
// unrelated person with the same name is free to create their own musician
// row and is never matched against someone else's linked identity.
export async function findMusicianNameMatches(name: string, userId: number): Promise<MusicianNameSuggestion[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const rows = await sql<
    { id: number; name: string; slug: string; band_name: string | null; band_slug: string | null }[]
  >`
    select musicians.id, musicians.name, musicians.slug, bands.name as band_name, bands.slug as band_slug
    from musicians
    left join band_members on band_members.musician_id = musicians.id
    left join bands on bands.id = band_members.band_id
    where lower(musicians.name) = lower(${trimmed})
      and (musicians.user_id is null or musicians.user_id = ${userId})
    order by musicians.name asc
  `;

  const map = new Map<number, MusicianNameSuggestion>();
  for (const row of rows) {
    let entry = map.get(row.id);
    if (!entry) {
      entry = { id: row.id, name: row.name, slug: row.slug, bands: [] };
      map.set(row.id, entry);
    }
    if (row.band_name && row.band_slug) {
      entry.bands.push({ name: row.band_name, slug: row.band_slug });
    }
  }
  return [...map.values()];
}

export class MusicianNotFoundError extends Error {
  constructor() {
    super("Musician not found");
  }
}

export class ForbiddenMusicianEditError extends Error {
  constructor() {
    super("You don't have edit access to this musician");
  }
}

export class InvalidMusicianNameError extends Error {
  constructor() {
    super("Name is required");
  }
}

const MAX_MUSICIAN_BIO_LENGTH = 280;

export class InvalidMusicianBioError extends Error {
  constructor() {
    super(`Bio must be ${MAX_MUSICIAN_BIO_LENGTH} characters or fewer`);
  }
}

export interface MusicianProfileUpdate {
  name?: string;
  bio?: string | null;
}

// Updates a musician's own-editable fields (name, bio) — gated by
// canEditMusician, checked again here (not just at the route) so the rule
// holds regardless of caller. `slug` is deliberately never written: it's the
// URL (/m/[slug]), so a name edit must never move it.
export async function updateMusicianProfile(
  musicianId: number,
  update: MusicianProfileUpdate,
  actingUser: User,
): Promise<Musician> {
  if (!(await canEditMusician(actingUser, musicianId))) {
    throw new ForbiddenMusicianEditError();
  }

  const fields: Partial<Record<"name" | "bio", string | null>> = {};
  if (update.name !== undefined) {
    const name = update.name.trim();
    if (!name) throw new InvalidMusicianNameError();
    fields.name = name;
  }
  if (update.bio !== undefined) {
    const bio = update.bio?.trim() || null;
    if (bio && bio.length > MAX_MUSICIAN_BIO_LENGTH) throw new InvalidMusicianBioError();
    fields.bio = bio;
  }

  if (Object.keys(fields).length === 0) {
    const [musician] = await sql<Musician[]>`select * from musicians where id = ${musicianId}`;
    if (!musician) throw new MusicianNotFoundError();
    return musician;
  }

  const [musician] = await sql<Musician[]>`
    update musicians set ${sql(fields)} where id = ${musicianId} returning *
  `;
  if (!musician) throw new MusicianNotFoundError();
  return musician;
}

// Points a musician's image_url at a freshly uploaded avatar. The upload
// itself (validate, resize via sharp, put to R2) happens in the route
// handler via lib/r2.ts; the caller is responsible for deleting the previous
// avatar object.
export async function setMusicianAvatar(musicianId: number, imageUrl: string): Promise<Musician> {
  const [musician] = await sql<Musician[]>`
    update musicians set image_url = ${imageUrl} where id = ${musicianId} returning *
  `;
  if (!musician) throw new MusicianNotFoundError();
  return musician;
}

export interface MusicianPageData extends Musician {
  bands: { name: string; slug: string }[];
  // The linked user's public identity — only populated when musicians.user_id
  // is set AND that user's profile_public is true, so app/m/[slug] never
  // leaks a link to a private profile.
  linkedUser: { username: string; name: string | null } | null;
}

// Everything app/m/[slug] needs in one call: the musician, their bands, and
// (conditionally) their linked Twin Scene account.
export async function getMusicianPageData(slug: string): Promise<MusicianPageData | null> {
  const musician = await getMusicianBySlug(slug);
  if (!musician) return null;

  const bands = await sql<{ name: string; slug: string }[]>`
    select bands.name, bands.slug
    from band_members
    join bands on bands.id = band_members.band_id
    where band_members.musician_id = ${musician.id}
    order by bands.name asc
  `;

  let linkedUser: { username: string; name: string | null } | null = null;
  if (musician.user_id) {
    const [user] = await sql<{ username: string | null; name: string | null; profile_public: boolean }[]>`
      select username, name, profile_public from users where id = ${musician.user_id} limit 1
    `;
    if (user?.profile_public && user.username) {
      linkedUser = { username: user.username, name: user.name };
    }
  }

  return { ...musician, bands, linkedUser };
}

export class UserAlreadyHasMusicianError extends Error {
  constructor() {
    super("Your account is already linked to a musician");
  }
}

// A musician row with the same name already exists — returned instead of
// creating a duplicate, so the UI can nudge toward claiming it instead.
export interface MusicianNameMatch {
  matched: true;
  musician: Musician;
}

// Self-serve creation of a brand-new musician identity, linked to `userId`
// immediately (no admin review — unlike claiming an *existing* musician,
// this grants no band_editors access, so there's nothing sensitive to gate).
// Guards the one-user-per-musician rule. If an existing musician's name
// matches exactly (case-insensitively), no duplicate is created — the caller
// gets that musician back instead so the UI can offer "claim it instead?".
export async function createMusicianForUser(
  userId: number,
  name: string,
): Promise<Musician | MusicianNameMatch> {
  const trimmed = name.trim();
  return sql.begin(async (tx) => {
    const [existingForUser] = await tx<{ id: number }[]>`
      select id from musicians where user_id = ${userId} limit 1
    `;
    if (existingForUser) {
      throw new UserAlreadyHasMusicianError();
    }

    const [match] = await tx<Musician[]>`
      select * from musicians where lower(name) = lower(${trimmed}) limit 1
    `;
    if (match) {
      return { matched: true, musician: match };
    }

    const slug = await uniqueMusicianSlug(tx, slugify(trimmed) || "musician");
    const [created] = await tx<Musician[]>`
      insert into musicians (name, slug, user_id) values (${trimmed}, ${slug}, ${userId}) returning *
    `;
    return created;
  });
}

// Always inserts a brand-new musician row — deliberately does NOT match an
// existing same-named musician (unlike findOrCreateMusicianByName below).
// Duplicate names are allowed by design (Slice B): a band-member claim's
// "I'm not listed" path uses this, since matching-by-name here would risk
// silently merging two different people who happen to share a name. Name
// matching is surfaced only as a suggestion elsewhere (findMusicianNameMatches),
// never an automatic merge.
export async function createNewMusician(tx: Tx, name: string): Promise<Musician> {
  const trimmed = name.trim();
  const slug = await uniqueMusicianSlug(tx, slugify(trimmed) || "musician");
  const [created] = await tx<Musician[]>`
    insert into musicians (name, slug) values (${trimmed}, ${slug}) returning *
  `;
  return created;
}

// Case-insensitive find-or-create, mirrors findOrCreateBandByName in
// lib/bands.ts. Must run inside the caller's transaction so the lookup,
// slug generation, and insert can't race a concurrent edit creating the
// same person.
export async function findOrCreateMusicianByName(tx: Tx, name: string): Promise<Musician> {
  const [existing] = await tx<Musician[]>`
    select * from musicians where lower(name) = lower(${name}) limit 1
  `;
  if (existing) return existing;

  const slug = await uniqueMusicianSlug(tx, slugify(name) || "musician");
  const [created] = await tx<Musician[]>`
    insert into musicians (name, slug) values (${name}, ${slug}) returning *
  `;
  return created;
}

// Reconciles a band's `band_members` rows to match `names` (in order):
// resolves each name to a musician (find-or-create by lower(name)), adds new
// links, drops links for names no longer in the list, and updates `position`
// to match the new order. `role` is never touched here — the source data
// (comma-joined name strings) never carries it, so an existing link's role
// (once Slice 2+ lets someone set one) survives a re-save of the same name.
export async function reconcileBandMembers(tx: Tx, bandId: number, names: string[]): Promise<void> {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);

  const musicianIds: number[] = [];
  for (const name of trimmed) {
    const musician = await findOrCreateMusicianByName(tx, name);
    musicianIds.push(musician.id);
  }

  if (musicianIds.length === 0) {
    await tx`delete from band_members where band_id = ${bandId}`;
    return;
  }

  await tx`
    delete from band_members
    where band_id = ${bandId} and musician_id not in ${tx(musicianIds)}
  `;

  for (const [index, musicianId] of musicianIds.entries()) {
    await tx`
      insert into band_members (band_id, musician_id, position)
      values (${bandId}, ${musicianId}, ${index})
      on conflict (band_id, musician_id) do update set position = excluded.position
    `;
  }
}

// A band's members, in display order — the new read path for BandProfile
// (replaces reading the raw `bands.members` string array directly).
export async function getBandMembers(bandId: number): Promise<BandMusician[]> {
  return sql<BandMusician[]>`
    select musicians.id, musicians.name, musicians.slug
    from band_members
    join musicians on musicians.id = band_members.musician_id
    where band_members.band_id = ${bandId}
    order by band_members.position asc
  `;
}

// The /musicians directory: every musician with at least one band link, each
// carrying the bands they're in. Sorted by number of bands descending, then
// name — same ordering the old string-derived buildMusiciansDirectory used.
export async function fetchMusiciansDirectory(): Promise<MusicianEntry[]> {
  const rows = await sql<
    { id: number; name: string; slug: string; band_name: string; band_slug: string }[]
  >`
    select musicians.id, musicians.name, musicians.slug,
           bands.name as band_name, bands.slug as band_slug
    from musicians
    join band_members on band_members.musician_id = musicians.id
    join bands on bands.id = band_members.band_id
    order by musicians.name asc
  `;

  const map = new Map<number, MusicianEntry>();
  for (const row of rows) {
    let entry = map.get(row.id);
    if (!entry) {
      entry = { id: row.id, name: row.name, slug: row.slug, bands: [] };
      map.set(row.id, entry);
    }
    entry.bands.push({ name: row.band_name, slug: row.band_slug });
  }

  return [...map.values()].sort(
    (a, b) =>
      b.bands.length - a.bands.length ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
