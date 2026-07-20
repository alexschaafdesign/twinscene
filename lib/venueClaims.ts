// Claim -> approve flow: a logged-in user requests editor access to a venue
// they don't yet have. Mirrors lib/mediaProClaims.ts; see migration 0035 for
// the schema and the partial unique index this relies on for "no two open
// claims on the same venue" idempotency.

import { sql } from "./db.ts";

export interface VenueClaim {
  id: number;
  user_id: number;
  venue_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingVenueClaim extends VenueClaim {
  user_email: string;
  venue_slug: string;
  venue_name: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this venue");
  }
}

// Opens a claim for `userId` on `venueId`. Throws DuplicateClaimError if the
// user already has an open (pending) claim — the partial unique index is the
// source of truth here (belt-and-suspenders against a race between the
// pre-check and the insert), so a claim previously *rejected* can be
// re-opened.
export async function createClaim(userId: number, venueId: number): Promise<VenueClaim> {
  try {
    const [claim] = await sql<VenueClaim[]>`
      insert into venue_claims (user_id, venue_id)
      values (${userId}, ${venueId})
      returning *
    `;
    return claim;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new DuplicateClaimError();
    }
    throw err;
  }
}

export async function listPendingClaims(): Promise<PendingVenueClaim[]> {
  return sql<PendingVenueClaim[]>`
    select venue_claims.*, users.email as user_email,
           venues.slug as venue_slug, venues.name as venue_name
    from venue_claims
    join users on users.id = venue_claims.user_id
    join venues on venues.id = venue_claims.venue_id
    where venue_claims.status = 'pending'
    order by venue_claims.created_at asc
  `;
}

// Approves or rejects a pending claim. Approval inserts the venue_editors row
// and flips the claim's status in the same transaction, so the two can never
// drift apart. Returns null if the claim doesn't exist or is no longer
// pending (re-deciding is a no-op, not an error, since a second admin
// clicking the same button shouldn't blow up).
export async function decideClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<VenueClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<VenueClaim[]>`
      update venue_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      await tx`
        insert into venue_editors (user_id, venue_id)
        values (${claim.user_id}, ${claim.venue_id})
        on conflict (user_id, venue_id) do nothing
      `;
    }

    return claim;
  });
}
