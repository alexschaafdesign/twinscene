// Band ownership Slice B: "I'm <musician> in <band>" — self-association is
// now INSTANT (a musician lists themselves in a band without waiting on
// anyone), and the only thing an owner/admin still approves is EDIT ACCESS.
//
// createMemberClaim does the association up front: it links musicians.user_id
// and inserts the band_members row (the public listing) immediately, then also
// opens a pending band_member_claims row that means "requests edit access to
// this band". decideMemberClaim's approval grants band_editors ONLY — the
// listing already exists; a rejection denies edit access but never un-lists
// the musician. See migration 0024 for the schema (unchanged — no new columns
// were needed; band_member_claims just carries a narrower meaning now).
//
// A claim always carries a concrete musician_id: the "I'm not listed" path
// creates a brand-new musician row (lib/musicians.ts createNewMusician) up
// front rather than deferring that to decide-time, so the listing and the
// musician it points at are created together, atomically.

import { sql } from "./db.ts";
import type { User } from "./auth.ts";
import { isBandOwner } from "./bandOwnership.ts";
import { createNewMusician } from "./musicians.ts";

export interface BandMemberClaim {
  id: number;
  user_id: number;
  band_id: number;
  musician_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingBandMemberClaim extends BandMemberClaim {
  user_email: string;
  musician_name: string;
  musician_slug: string;
  band_name: string;
  band_slug: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this musician for this band");
  }
}

export class MusicianAlreadyLinkedError extends Error {
  constructor() {
    super("This musician is already linked to another account");
  }
}

export class UserAlreadyLinkedError extends Error {
  constructor() {
    super("Your account is already linked to a different musician");
  }
}

export class MusicianNotFoundError extends Error {
  constructor() {
    super("Musician not found");
  }
}

export class ForbiddenClaimDecisionError extends Error {
  constructor() {
    super("You don't have permission to decide this claim");
  }
}

// The single rule for "can this user approve/reject a claim on this band" —
// the band's owner, or an admin (isBandOwner already treats admins as owners
// of every band, so this is mostly a documented alias for that rule at claim
// call sites; ownerless bands fall through to admin-only since isBandOwner
// returns false for everyone but an admin when no owner row exists).
export async function canApproveMemberClaim(user: User | null, bandId: number): Promise<boolean> {
  return isBandOwner(user, bandId);
}

// Self-lists `actingUser` in `bandId` — against an existing musician
// (`musicianId`) or a brand-new one created on the spot (`newName` — never
// matched against an existing same-named musician; see createNewMusician).
// The listing is INSTANT: this links musicians.user_id and inserts the
// band_members row in the same transaction, no approval required. It also
// opens a pending band_member_claims row = a request for EDIT ACCESS, which
// an owner/admin can later approve (decideMemberClaim) to grant band_editors.
//
// Guards (unchanged): the musician must be unlinked or already linked to
// `actingUser` (listing your own musician in another band is fine);
// `actingUser` must not already be linked to a *different* musician.
//
// Because the listing is the point, a duplicate edit-access request is NOT an
// error — the association is idempotent, so we just return the existing
// pending claim (or the freshly inserted one) and the caller treats it as
// success.
export async function createMemberClaim(
  actingUser: User,
  bandId: number,
  input: { musicianId: number } | { newName: string },
): Promise<BandMemberClaim> {
  return sql.begin(async (tx) => {
    let musicianId: number;
    if ("musicianId" in input) {
      musicianId = input.musicianId;
    } else {
      const musician = await createNewMusician(tx, input.newName);
      musicianId = musician.id;
    }

    const [musician] = await tx<{ user_id: number | null }[]>`
      select user_id from musicians where id = ${musicianId} limit 1
    `;
    if (!musician) {
      throw new MusicianNotFoundError();
    }
    if (musician.user_id !== null && musician.user_id !== actingUser.id) {
      throw new MusicianAlreadyLinkedError();
    }
    if (musician.user_id === null) {
      const [userLink] = await tx<{ id: number }[]>`
        select id from musicians where user_id = ${actingUser.id} limit 1
      `;
      if (userLink) {
        throw new UserAlreadyLinkedError();
      }
      await tx`update musicians set user_id = ${actingUser.id} where id = ${musicianId}`;
    }

    // The instant listing — idempotent, so re-listing an already-listed
    // musician is a no-op rather than a duplicate error.
    await tx`
      insert into band_members (band_id, musician_id, position)
      select ${bandId}, ${musicianId},
             coalesce((select max(position) + 1 from band_members where band_id = ${bandId}), 0)
      on conflict (band_id, musician_id) do nothing
    `;

    // The surviving approval surface: a pending request for edit access. A
    // duplicate just means one's already open, so return that instead of
    // failing (the listing above still happened either way).
    const [claim] = await tx<BandMemberClaim[]>`
      insert into band_member_claims (user_id, band_id, musician_id)
      values (${actingUser.id}, ${bandId}, ${musicianId})
      on conflict (user_id, band_id, musician_id) where status = 'pending' do nothing
      returning *
    `;
    if (claim) return claim;

    const [existing] = await tx<BandMemberClaim[]>`
      select * from band_member_claims
      where user_id = ${actingUser.id} and band_id = ${bandId}
        and musician_id = ${musicianId} and status = 'pending'
      limit 1
    `;
    return existing;
  });
}

// A logged-in user's own pending edit-access requests, for display on
// /profile — "You're listed as <musician> in <band>; edit access is awaiting
// review." (The listing itself already exists; only edit access is pending.)
export async function listPendingClaimsForUser(userId: number): Promise<PendingBandMemberClaim[]> {
  return sql<PendingBandMemberClaim[]>`
    select band_member_claims.*, users.email as user_email,
           musicians.name as musician_name, musicians.slug as musician_slug,
           bands.name as band_name, bands.slug as band_slug
    from band_member_claims
    join users on users.id = band_member_claims.user_id
    join musicians on musicians.id = band_member_claims.musician_id
    join bands on bands.id = band_member_claims.band_id
    where band_member_claims.user_id = ${userId} and band_member_claims.status = 'pending'
    order by band_member_claims.created_at asc
  `;
}

// Pending edit-access requests for one band — the owner-facing "Members
// requesting edit access" list embedded on that band's page.
export async function listPendingClaimsForBand(bandId: number): Promise<PendingBandMemberClaim[]> {
  return sql<PendingBandMemberClaim[]>`
    select band_member_claims.*, users.email as user_email,
           musicians.name as musician_name, musicians.slug as musician_slug,
           bands.name as band_name, bands.slug as band_slug
    from band_member_claims
    join users on users.id = band_member_claims.user_id
    join musicians on musicians.id = band_member_claims.musician_id
    join bands on bands.id = band_member_claims.band_id
    where band_member_claims.band_id = ${bandId} and band_member_claims.status = 'pending'
    order by band_member_claims.created_at asc
  `;
}

// Aggregate pending claims across every band `userId` owns — /profile's
// "Bands you own" section surfaces this so an owner doesn't have to visit
// each band page to see what's waiting on them.
export async function listPendingClaimsForOwner(userId: number): Promise<PendingBandMemberClaim[]> {
  return sql<PendingBandMemberClaim[]>`
    select band_member_claims.*, users.email as user_email,
           musicians.name as musician_name, musicians.slug as musician_slug,
           bands.name as band_name, bands.slug as band_slug
    from band_member_claims
    join users on users.id = band_member_claims.user_id
    join musicians on musicians.id = band_member_claims.musician_id
    join bands on bands.id = band_member_claims.band_id
    where band_member_claims.status = 'pending'
      and band_member_claims.band_id in (
        select band_id from band_editors where user_id = ${userId} and role = 'owner'
      )
    order by band_member_claims.created_at asc
  `;
}

// Admin oversight queue — every pending claim, not just ownerless bands'
// (owners handle their own bands directly; this is fallback + visibility).
export async function listAllPendingClaims(): Promise<PendingBandMemberClaim[]> {
  return sql<PendingBandMemberClaim[]>`
    select band_member_claims.*, users.email as user_email,
           musicians.name as musician_name, musicians.slug as musician_slug,
           bands.name as band_name, bands.slug as band_slug
    from band_member_claims
    join users on users.id = band_member_claims.user_id
    join musicians on musicians.id = band_member_claims.musician_id
    join bands on bands.id = band_member_claims.band_id
    where band_member_claims.status = 'pending'
    order by band_member_claims.created_at asc
  `;
}

// Approves or rejects a pending EDIT-ACCESS request. Requires
// canApproveMemberClaim (checked here, not just at the route, so the rule
// holds regardless of caller — mirrors canEditMusician's re-check inside
// updateMusicianProfile). Approval grants band_editors role='member' via
// ON CONFLICT DO NOTHING — a plain insert-if-absent that can never downgrade
// an existing 'owner' row. Rejection denies edit access and leaves the
// listing intact (it never un-lists the musician). Returns null if the claim
// doesn't exist or is no longer pending.
//
// The musician-link + band_members inserts below are redundant for claims
// created by the current createMemberClaim (which already listed the musician
// up front) — they're kept idempotent so LEGACY pending claims, opened before
// listing became instant, still fully associate on approval.
export async function decideMemberClaim(
  claimId: number,
  decision: "approved" | "rejected",
  actingUser: User,
): Promise<BandMemberClaim | null> {
  const [pending] = await sql<{ band_id: number }[]>`
    select band_id from band_member_claims where id = ${claimId} and status = 'pending' limit 1
  `;
  if (!pending) return null;

  if (!(await canApproveMemberClaim(actingUser, pending.band_id))) {
    throw new ForbiddenClaimDecisionError();
  }

  return sql.begin(async (tx) => {
    const [claim] = await tx<BandMemberClaim[]>`
      update band_member_claims
      set status = ${decision}, decided_at = now(), decided_by = ${actingUser.id}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      const [musician] = await tx<{ user_id: number | null }[]>`
        select user_id from musicians where id = ${claim.musician_id} limit 1
      `;
      if (musician?.user_id && musician.user_id !== claim.user_id) {
        throw new MusicianAlreadyLinkedError();
      }
      if (!musician?.user_id) {
        await tx`
          update musicians set user_id = ${claim.user_id} where id = ${claim.musician_id}
        `;
      }

      await tx`
        insert into band_members (band_id, musician_id, position)
        select ${claim.band_id}, ${claim.musician_id},
               coalesce((select max(position) + 1 from band_members where band_id = ${claim.band_id}), 0)
        on conflict (band_id, musician_id) do nothing
      `;

      await tx`
        insert into band_editors (user_id, band_id, role)
        values (${claim.user_id}, ${claim.band_id}, 'member')
        on conflict (user_id, band_id) do nothing
      `;
    }

    return claim;
  });
}
