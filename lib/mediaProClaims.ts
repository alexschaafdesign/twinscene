// Claim -> approve flow: a logged-in user requests editor access to a media
// pro listing they don't yet have (lib/mediaProEditors.ts covers the
// admin-assignment path into the same media_pro_editors table). Mirrors
// lib/bandClaims.ts; see migration 0031 for the schema and the partial
// unique index this relies on for "no two open claims on the same listing"
// idempotency.

import { sql } from "./db.ts";

export interface MediaProClaim {
  id: number;
  user_id: number;
  media_pro_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingMediaProClaim extends MediaProClaim {
  user_email: string;
  media_pro_slug: string;
  media_pro_name: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this listing");
  }
}

// Opens a claim for `userId` on `mediaProId`. Throws DuplicateClaimError if
// the user already has an open (pending) claim — the partial unique index is
// the source of truth here (belt-and-suspenders against a race between the
// pre-check and the insert), so a claim previously *rejected* can be
// re-opened.
export async function createClaim(userId: number, mediaProId: number): Promise<MediaProClaim> {
  try {
    const [claim] = await sql<MediaProClaim[]>`
      insert into media_pro_claims (user_id, media_pro_id)
      values (${userId}, ${mediaProId})
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

export async function listPendingClaims(): Promise<PendingMediaProClaim[]> {
  return sql<PendingMediaProClaim[]>`
    select media_pro_claims.*, users.email as user_email,
           media_pros.slug as media_pro_slug, media_pros.name as media_pro_name
    from media_pro_claims
    join users on users.id = media_pro_claims.user_id
    join media_pros on media_pros.id = media_pro_claims.media_pro_id
    where media_pro_claims.status = 'pending'
    order by media_pro_claims.created_at asc
  `;
}

// Approves or rejects a pending claim. Approval inserts the
// media_pro_editors row and flips the claim's status in the same
// transaction, so the two can never drift apart. Returns null if the claim
// doesn't exist or is no longer pending (re-deciding is a no-op, not an
// error, since a second admin clicking the same button shouldn't blow up).
export async function decideClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<MediaProClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<MediaProClaim[]>`
      update media_pro_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      await tx`
        insert into media_pro_editors (user_id, media_pro_id)
        values (${claim.user_id}, ${claim.media_pro_id})
        on conflict (user_id, media_pro_id) do nothing
      `;
    }

    return claim;
  });
}
