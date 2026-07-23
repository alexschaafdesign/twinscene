// User-centric view of editing rights, backing the admin Users page's inline
// "Manage access" panel. The existing grant flows are all keyed from the
// account's side (add an editor to THIS band/writer/comrade by email) or wait
// on a user-initiated claim; this module inverts that — pick a user, then grant
// or revoke any identity they should be able to edit.
//
// Three of the four identities are join-table grants that share the exact same
// shape (band_editors / writer_editors / comrade_editors), so we reuse their
// add*/remove* primitives. The fourth, musician, is a single unique column
// (musicians.user_id) and routes through setMusicianUser/unsetMusicianUser.
//
// Every function here assumes the caller has already checked isAdmin — the API
// route is the gate, this is just the data layer.

import { sql } from "./db.ts";
import { addBandEditor, removeBandEditor } from "./bandEditors.ts";
import { addWriterEditor, removeWriterEditor } from "./writerEditors.ts";
import { addComradeEditor, removeComradeEditor } from "./comradeEditors.ts";
import {
  setMusicianUser,
  unsetMusicianUser,
  searchMusiciansByName,
  MusicianLinkConflict,
} from "./musicians.ts";

export { MusicianLinkConflict };

export type GrantType = "band" | "writer" | "comrade" | "musician";
export const GRANT_TYPES: GrantType[] = ["band", "writer", "comrade", "musician"];

export function isGrantType(value: unknown): value is GrantType {
  return typeof value === "string" && (GRANT_TYPES as string[]).includes(value);
}

export interface IdentityRef {
  id: number;
  name: string;
  slug: string;
}

// One editable identity a user currently holds. `role` is the join-table role
// for band/writer/comrade; musician has no role, so it's null there.
export interface Grant extends IdentityRef {
  type: GrantType;
  role: string | null;
}

// The user whose grants we're mutating. We need the id (for the musician
// column write) and the email (the join-table add* primitives are keyed by
// email so they can findOrCreateUserByEmail — here the user already exists).
export interface GrantTarget {
  id: number;
  email: string;
}

// Every identity this user may edit, across all four types, flattened and
// ordered type-then-name for a stable UI. One round-trip per type; the counts
// are tiny (a user edits a handful of things, not thousands).
export async function listUserGrants(userId: number): Promise<Grant[]> {
  const [bands, writers, comrades, musician] = await Promise.all([
    sql<{ id: number; name: string; slug: string; role: string }[]>`
      select b.id, b.name, b.slug, be.role
      from band_editors be join bands b on b.id = be.band_id
      where be.user_id = ${userId}
      order by b.name asc
    `,
    sql<{ id: number; name: string; slug: string; role: string }[]>`
      select w.id, w.name, w.slug, we.role
      from writer_editors we join writers w on w.id = we.writer_id
      where we.user_id = ${userId}
      order by w.name asc
    `,
    sql<{ id: number; name: string; slug: string; role: string }[]>`
      select c.id, c.name, c.slug, ce.role
      from comrade_editors ce join comrades c on c.id = ce.comrade_id
      where ce.user_id = ${userId}
      order by c.name asc
    `,
    sql<{ id: number; name: string; slug: string }[]>`
      select id, name, slug from musicians where user_id = ${userId} limit 1
    `,
  ]);

  return [
    ...bands.map((r) => ({ type: "band" as const, ...r })),
    ...writers.map((r) => ({ type: "writer" as const, ...r })),
    ...comrades.map((r) => ({ type: "comrade" as const, ...r })),
    ...musician.map((r) => ({ type: "musician" as const, role: null, ...r })),
  ];
}

// Name search for the grant picker, scoped to one identity type. Returns at
// most `limit` matches as {id, name, slug}. Band/writer/comrade are direct
// ILIKE lookups here; musician reuses its own helper.
export async function searchIdentities(
  type: GrantType,
  query: string,
  limit = 10,
): Promise<IdentityRef[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const prefix = `${q}%`;
  switch (type) {
    case "band":
      return sql<IdentityRef[]>`
        select id, name, slug from bands
        where name ilike ${like}
        order by (name ilike ${prefix}) desc, name asc limit ${limit}
      `;
    case "writer":
      return sql<IdentityRef[]>`
        select id, name, slug from writers
        where name ilike ${like}
        order by (name ilike ${prefix}) desc, name asc limit ${limit}
      `;
    case "comrade":
      return sql<IdentityRef[]>`
        select id, name, slug from comrades
        where name ilike ${like}
        order by (name ilike ${prefix}) desc, name asc limit ${limit}
      `;
    case "musician":
      return searchMusiciansByName(q, limit);
  }
}

// Confirms an identity id actually exists before we try to grant it — turns a
// bogus/stale target_id into a clean 404 instead of an FK-violation 500.
async function identityExists(type: GrantType, id: number): Promise<boolean> {
  const rows =
    type === "band"
      ? await sql`select 1 from bands where id = ${id} limit 1`
      : type === "writer"
        ? await sql`select 1 from writers where id = ${id} limit 1`
        : type === "comrade"
          ? await sql`select 1 from comrades where id = ${id} limit 1`
          : await sql`select 1 from musicians where id = ${id} limit 1`;
  return rows.length > 0;
}

// Grants `target` (user) editing rights over the identity of `type`/`targetId`.
// Idempotent per the underlying primitives. `role` applies to the join-table
// identities ('editor' | 'owner'); ignored for musician. Returns the updated
// full grant list so the caller can replace its state in one shot.
// Throws MusicianLinkConflict (musician only) on a link collision.
export async function grantIdentity(
  type: GrantType,
  targetId: number,
  target: GrantTarget,
  role: string = "editor",
): Promise<Grant[]> {
  if (!(await identityExists(type, targetId))) {
    throw new GrantNotFound(`That ${type} no longer exists.`);
  }
  switch (type) {
    case "band":
      await addBandEditor(targetId, target.email, role);
      break;
    case "writer":
      await addWriterEditor(targetId, target.email, role);
      break;
    case "comrade":
      await addComradeEditor(targetId, target.email, role);
      break;
    case "musician":
      await setMusicianUser(targetId, target.id);
      break;
  }
  return listUserGrants(target.id);
}

// Revokes the grant. Returns the updated full grant list.
export async function revokeIdentity(
  type: GrantType,
  targetId: number,
  target: GrantTarget,
): Promise<Grant[]> {
  switch (type) {
    case "band":
      await removeBandEditor(targetId, target.id);
      break;
    case "writer":
      await removeWriterEditor(targetId, target.id);
      break;
    case "comrade":
      await removeComradeEditor(targetId, target.id);
      break;
    case "musician":
      await unsetMusicianUser(targetId, target.id);
      break;
  }
  return listUserGrants(target.id);
}

export class GrantNotFound extends Error {}
