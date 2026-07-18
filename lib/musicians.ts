// Data layer for the `musicians` + `band_members` tables (migration 0021).
// Replaces the old string-derived musician grouping: `bands.members` (jsonb
// string[]) stays as a frozen backup, kept in sync by lib/bands.ts's
// upsertBand via reconcileBandMembers below, but musicians and their band
// links are now real rows with stable ids/slugs.

import { sql } from "./db.ts";
import type postgres from "postgres";
import { slugify } from "./bands.ts";

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
