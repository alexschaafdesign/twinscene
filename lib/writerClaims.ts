// Claim -> approve flow: a logged-in user requests editor access to a writer
// listing they don't yet have (lib/writerEditors.ts covers the
// admin-assignment path into the same writer_editors table). Mirrors
// lib/mediaProClaims.ts; see migration 0063 for the schema and the partial
// unique index this relies on for "no two open claims on the same listing"
// idempotency.

import { sql } from "./db.ts";

export interface WriterClaim {
  id: number;
  user_id: number;
  writer_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingWriterClaim extends WriterClaim {
  user_email: string;
  writer_slug: string;
  writer_name: string;
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this listing");
  }
}

// Opens a claim for `userId` on `writerId`. Throws DuplicateClaimError if the
// user already has an open (pending) claim — the partial unique index is the
// source of truth here (belt-and-suspenders against a race between the
// pre-check and the insert), so a claim previously *rejected* can be re-opened.
export async function createClaim(userId: number, writerId: number): Promise<WriterClaim> {
  try {
    const [claim] = await sql<WriterClaim[]>`
      insert into writer_claims (user_id, writer_id)
      values (${userId}, ${writerId})
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

export async function listPendingClaims(): Promise<PendingWriterClaim[]> {
  return sql<PendingWriterClaim[]>`
    select writer_claims.*, users.email as user_email,
           writers.slug as writer_slug, writers.name as writer_name
    from writer_claims
    join users on users.id = writer_claims.user_id
    join writers on writers.id = writer_claims.writer_id
    where writer_claims.status = 'pending'
    order by writer_claims.created_at asc
  `;
}

// Approves or rejects a pending claim. Approval inserts the writer_editors row
// and flips the claim's status in the same transaction, so the two can never
// drift apart. Returns null if the claim doesn't exist or is no longer pending
// (re-deciding is a no-op, not an error, since a second admin clicking the
// same button shouldn't blow up).
export async function decideClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<WriterClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<WriterClaim[]>`
      update writer_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      await tx`
        insert into writer_editors (user_id, writer_id)
        values (${claim.user_id}, ${claim.writer_id})
        on conflict (user_id, writer_id) do nothing
      `;
    }

    return claim;
  });
}
