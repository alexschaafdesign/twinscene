// Claim -> approve flow: a logged-in user requests editor access to a band
// they don't yet have (lib/bandEditors.ts covers the admin-assignment path
// into the same band_editors table). See migration 0017 for the schema and
// the partial unique index this relies on for "no two open claims on the
// same band" idempotency.

import { sql } from "./db.ts";

export interface BandClaim {
  id: number;
  user_id: number;
  band_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingClaim extends BandClaim {
  user_email: string;
  band_slug: string;
  band_name: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this band");
  }
}

// Opens a claim for `userId` on `bandId`. Throws DuplicateClaimError if the
// user already has an open (pending) claim on the band — the partial unique
// index is the source of truth here (belt-and-suspenders against a race
// between the pre-check and the insert), so a claim on a band the user
// previously had *rejected* is allowed to be re-opened.
export async function createClaim(userId: number, bandId: number): Promise<BandClaim> {
  try {
    const [claim] = await sql<BandClaim[]>`
      insert into band_claims (user_id, band_id)
      values (${userId}, ${bandId})
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

export async function listPendingClaims(): Promise<PendingClaim[]> {
  return sql<PendingClaim[]>`
    select band_claims.*, users.email as user_email, bands.slug as band_slug, bands.name as band_name
    from band_claims
    join users on users.id = band_claims.user_id
    join bands on bands.id = band_claims.band_id
    where band_claims.status = 'pending'
    order by band_claims.created_at asc
  `;
}

// Approves or rejects a pending claim. Approval inserts the band_editors row
// and flips the claim's status in the same transaction, so the two can never
// drift apart. Returns null if the claim doesn't exist or is no longer
// pending (already decided — re-deciding is a no-op, not an error, since a
// second admin clicking the same button shouldn't blow up).
export async function decideClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<BandClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<BandClaim[]>`
      update band_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      await tx`
        insert into band_editors (user_id, band_id)
        values (${claim.user_id}, ${claim.band_id})
        on conflict (user_id, band_id) do nothing
      `;
    }

    return claim;
  });
}
