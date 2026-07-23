// Claim -> approve flow: a logged-in user requests editor access to a
// comrade listing they don't yet have (lib/comradeEditors.ts covers the
// admin-assignment path into the same comrade_editors table). Mirrors
// lib/mediaProClaims.ts; see migration 0064 for the schema and the partial
// unique index this relies on for "no two open claims on the same listing"
// idempotency.

import { sql } from "./db.ts";

export interface ComradeClaim {
  id: number;
  user_id: number;
  comrade_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingComradeClaim extends ComradeClaim {
  user_email: string;
  comrade_slug: string;
  comrade_name: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this listing");
  }
}

// Opens a claim for `userId` on `comradeId`. Throws DuplicateClaimError if
// the user already has an open (pending) claim — the partial unique index is
// the source of truth here (belt-and-suspenders against a race between the
// pre-check and the insert), so a claim previously *rejected* can be
// re-opened.
export async function createClaim(userId: number, comradeId: number): Promise<ComradeClaim> {
  try {
    const [claim] = await sql<ComradeClaim[]>`
      insert into comrade_claims (user_id, comrade_id)
      values (${userId}, ${comradeId})
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

export async function listPendingClaims(): Promise<PendingComradeClaim[]> {
  return sql<PendingComradeClaim[]>`
    select comrade_claims.*, users.email as user_email,
           comrades.slug as comrade_slug, comrades.name as comrade_name
    from comrade_claims
    join users on users.id = comrade_claims.user_id
    join comrades on comrades.id = comrade_claims.comrade_id
    where comrade_claims.status = 'pending'
    order by comrade_claims.created_at asc
  `;
}

// Approves or rejects a pending claim. Approval inserts the comrade_editors
// row and flips the claim's status in the same transaction, so the two can
// never drift apart. Returns null if the claim doesn't exist or is no
// longer pending (re-deciding is a no-op, not an error, since a second
// admin clicking the same button shouldn't blow up).
export async function decideClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<ComradeClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<ComradeClaim[]>`
      update comrade_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      await tx`
        insert into comrade_editors (user_id, comrade_id)
        values (${claim.user_id}, ${claim.comrade_id})
        on conflict (user_id, comrade_id) do nothing
      `;
    }

    return claim;
  });
}
