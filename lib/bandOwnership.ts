// Band ownership: an admin verifies a band's Instagram out-of-band, generates
// a one-time high-entropy code (raw value returned once, only its hash
// persisted — same shape as login_tokens/lib/auth.ts), DMs it to the band,
// and whoever redeems it becomes an 'owner' in band_editors. Owners are a
// superset of editors (canEditBand in lib/auth.ts is unchanged: any
// band_editors row, regardless of role, grants edit rights).

import crypto from "node:crypto";
import { sql } from "./db.ts";
import type { User } from "./auth.ts";
import type { Band } from "./bands.ts";

function hashCode(rawCode: string): string {
  return crypto.createHash("sha256").update(rawCode).digest("hex");
}

export class InvalidOwnershipCodeError extends Error {
  constructor() {
    super("Invalid code");
  }
}

export class ExpiredOwnershipCodeError extends Error {
  constructor() {
    super("This code has expired");
  }
}

export class AlreadyRedeemedOwnershipCodeError extends Error {
  constructor() {
    super("This code has already been redeemed");
  }
}

// Admin-only: mints a new code for `bandId`, storing only its hash, and
// returns the plaintext ONCE for the admin to copy/DM. Never logged, never
// persisted in the clear. The is_admin check here is belt-and-suspenders —
// the route already gates on it — same pattern as canEditBand re-checking
// server-side rather than trusting the caller.
export async function generateOwnershipCode(bandId: number, adminUser: User): Promise<string> {
  if (!adminUser.is_admin) {
    throw new Error("Only admins can generate ownership codes");
  }

  const rawCode = crypto.randomBytes(24).toString("hex");
  await sql`
    insert into band_ownership_codes (band_id, code_hash, created_by, expires_at)
    values (${bandId}, ${hashCode(rawCode)}, ${adminUser.id}, now() + interval '30 days')
  `;
  return rawCode;
}

// Hashes `rawCode`, locks the matching row, and — in one transaction — grants
// `user` the 'owner' role on the code's band (upserting band_editors, so a
// user who already had plain editor access is simply promoted) and marks the
// code redeemed. Throws a specific error for invalid/expired/already-used
// codes so the route can map each to a clean response. Expiry is checked in
// SQL (`expires_at <= now()`) rather than comparing to `Date.now()` in JS, to
// avoid any app/DB clock-skew edge case.
export async function redeemOwnershipCode(rawCode: string, user: User): Promise<Band> {
  const codeHash = hashCode(rawCode);

  return sql.begin(async (tx) => {
    const [row] = await tx<
      { id: number; band_id: number; redeemed_by: number | null; expired: boolean }[]
    >`
      select id, band_id, redeemed_by, (expires_at <= now()) as expired
      from band_ownership_codes
      where code_hash = ${codeHash}
      for update
    `;
    if (!row) throw new InvalidOwnershipCodeError();
    if (row.redeemed_by) throw new AlreadyRedeemedOwnershipCodeError();
    if (row.expired) throw new ExpiredOwnershipCodeError();

    await tx`
      update band_ownership_codes
      set redeemed_by = ${user.id}, redeemed_at = now()
      where id = ${row.id}
    `;
    await tx`
      insert into band_editors (user_id, band_id, role)
      values (${user.id}, ${row.band_id}, 'owner')
      on conflict (user_id, band_id) do update set role = 'owner'
    `;

    const [band] = await tx<Band[]>`select * from bands where id = ${row.band_id}`;
    return band;
  });
}

export async function isBandOwner(user: User | null, bandId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from band_editors where user_id = ${user.id} and band_id = ${bandId} and role = 'owner' limit 1
  `;
  return !!row;
}

// Band-wide (not viewer-specific): does ANY user hold the 'owner' role on
// this band? Powers the public "Unclaimed"/"Claimed" indicator on the band
// page — unlike isBandOwner, this never treats admins as a stand-in owner.
export async function bandHasOwner(bandId: number): Promise<boolean> {
  const [row] = await sql`
    select 1 from band_editors where band_id = ${bandId} and role = 'owner' limit 1
  `;
  return !!row;
}

export interface OwnedBand {
  id: number;
  slug: string;
  name: string;
}

// Bands where `userId` explicitly holds the 'owner' role — deliberately NOT
// "every band" for an admin; this powers a profile listing, not a permission
// check.
export async function listOwnedBands(userId: number): Promise<OwnedBand[]> {
  return sql<OwnedBand[]>`
    select bands.id, bands.slug, bands.name
    from band_editors
    join bands on bands.id = band_editors.band_id
    where band_editors.user_id = ${userId} and band_editors.role = 'owner'
    order by bands.name asc
  `;
}

export interface OwnershipCodeStatus {
  id: number;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by_email: string | null;
}

// Status-only listing for the admin UI — created/expiry/redeemed metadata,
// NEVER the raw code (it isn't stored anywhere to list).
export async function listOwnershipCodes(bandId: number): Promise<OwnershipCodeStatus[]> {
  return sql<OwnershipCodeStatus[]>`
    select band_ownership_codes.id, band_ownership_codes.created_at, band_ownership_codes.expires_at,
           band_ownership_codes.redeemed_at, users.email as redeemed_by_email
    from band_ownership_codes
    left join users on users.id = band_ownership_codes.redeemed_by
    where band_ownership_codes.band_id = ${bandId}
    order by band_ownership_codes.created_at desc
  `;
}
