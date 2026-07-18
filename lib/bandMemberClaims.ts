// Band ownership Slice B: "I'm <musician> in <band>" claims, approved by that
// band's OWNER (isBandOwner, lib/bandOwnership.ts) with an admin as fallback
// for ownerless bands. Replaces Slice 2's musician_claims (admin-only,
// identity-scoped — linked a user to a musician and granted band_editors for
// every band that musician was in). See migration 0024 for the schema.
//
// A claim always carries a concrete musician_id: the "I'm not listed" path
// creates a brand-new musician row (lib/musicians.ts createNewMusician) up
// front rather than deferring that to decide-time, so the pending claim and
// the musician it points at are created together, atomically.

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

// Opens a claim for `actingUser` on `bandId`, either against an existing
// musician (`musicianId`) or a brand-new one created on the spot (`newName`
// — never matched against an existing same-named musician; see
// createNewMusician). Guards: the musician must be unlinked or already
// linked to `actingUser` (re-requesting a different band under your own
// musician is the Slice 2-deferred "add my musician to another band" flow);
// `actingUser` must not already be linked to a *different* musician.
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
    }

    try {
      const [claim] = await tx<BandMemberClaim[]>`
        insert into band_member_claims (user_id, band_id, musician_id)
        values (${actingUser.id}, ${bandId}, ${musicianId})
        returning *
      `;
      return claim;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        throw new DuplicateClaimError();
      }
      throw err;
    }
  });
}

// A logged-in user's own pending claims, for display on /profile — "Your
// claim for <musician> in <band> is awaiting review."
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

// Pending claims for one band — the owner-facing "Pending member requests"
// list embedded on that band's page.
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

// Approves or rejects a pending claim. Requires canApproveMemberClaim
// (checked here, not just at the route, so the rule holds regardless of
// caller — mirrors canEditMusician's re-check inside updateMusicianProfile).
// Approval, in one transaction: links musicians.user_id if not already
// linked (re-checked here against the race where a different claim on the
// same musician was decided first), ensures a band_members row exists, and
// grants band_editors role='member' via ON CONFLICT DO NOTHING — a plain
// insert-if-absent that can never downgrade an existing 'owner' row. Returns
// null if the claim doesn't exist or is no longer pending.
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
