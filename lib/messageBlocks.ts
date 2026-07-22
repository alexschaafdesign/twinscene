// Per-identity message blocking (migration 0057). A band/musician can block a
// human from messaging it. Blocks are owned by the identity, so any editor of a
// band can add/remove one and it applies for the whole band — mirroring the
// shared inbox. Enforcement (in the message routes) is one-directional: it
// stops the blocked human from sending TO the identity; the identity's own side
// can always still reply (and unblock).

import { sql } from "./db.ts";
import type { RecipientType } from "./messaging.ts";

// Is `userId` blocked from messaging this identity? A single-row PK point
// lookup (blocker_type, blocker_id, blocked_user_id).
export async function isBlocked(
  blockerType: RecipientType,
  blockerId: number,
  userId: number,
): Promise<boolean> {
  const [row] = await sql`
    select 1 from message_blocks
    where blocker_type = ${blockerType}
      and blocker_id = ${blockerId}
      and blocked_user_id = ${userId}
    limit 1
  `;
  return !!row;
}

// Block `blockedUserId` from messaging the identity. Idempotent — re-blocking an
// already-blocked user is a no-op (the created_at / who-blocked are kept from
// the first block). Authorization (the caller controls this identity) is checked
// in the route before this runs.
export async function blockUser({
  blockerType,
  blockerId,
  blockedUserId,
  byUserId,
}: {
  blockerType: RecipientType;
  blockerId: number;
  blockedUserId: number;
  byUserId: number;
}): Promise<void> {
  await sql`
    insert into message_blocks (blocker_type, blocker_id, blocked_user_id, blocked_by_user_id)
    values (${blockerType}, ${blockerId}, ${blockedUserId}, ${byUserId})
    on conflict (blocker_type, blocker_id, blocked_user_id) do nothing
  `;
}

export async function unblockUser({
  blockerType,
  blockerId,
  blockedUserId,
}: {
  blockerType: RecipientType;
  blockerId: number;
  blockedUserId: number;
}): Promise<void> {
  await sql`
    delete from message_blocks
    where blocker_type = ${blockerType}
      and blocker_id = ${blockerId}
      and blocked_user_id = ${blockedUserId}
  `;
}
