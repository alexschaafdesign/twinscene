// Claim -> approve flow: a logged-in user requests to be linked to an
// existing musician entity (lib/musicians.ts's createMusicianForUser covers
// the self-serve "I'm not listed" path into the same musicians.user_id
// column). Mirrors lib/bandClaims.ts almost exactly — see migration 0022 for
// the schema and the partial unique index this relies on.

import { sql } from "./db.ts";

export interface MusicianClaim {
  id: number;
  user_id: number;
  musician_id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export interface PendingMusicianClaim extends MusicianClaim {
  user_email: string;
  musician_name: string;
  musician_slug: string;
  bands: { name: string; slug: string }[];
}

export class DuplicateClaimError extends Error {
  constructor() {
    super("You already have a pending claim on this musician");
  }
}

export class MusicianAlreadyLinkedError extends Error {
  constructor() {
    super("This musician is already linked to another account");
  }
}

export class UserAlreadyLinkedError extends Error {
  constructor() {
    super("Your account is already linked to a musician");
  }
}

// Opens a claim for `userId` on `musicianId`. Guards: the musician must not
// already be linked to a user, and the user must not already have a linked
// musician — both checked here and re-enforced at decide-time (the musician
// check) since either could change between now and an admin's decision.
// Throws DuplicateClaimError on the pending-unique race (belt-and-suspenders
// against a race between the pre-check and the insert).
export async function createMusicianClaim(userId: number, musicianId: number): Promise<MusicianClaim> {
  const [musician] = await sql<{ user_id: number | null }[]>`
    select user_id from musicians where id = ${musicianId} limit 1
  `;
  if (musician?.user_id) {
    throw new MusicianAlreadyLinkedError();
  }

  const [user] = await sql<{ id: number }[]>`
    select id from musicians where user_id = ${userId} limit 1
  `;
  if (user) {
    throw new UserAlreadyLinkedError();
  }

  try {
    const [claim] = await sql<MusicianClaim[]>`
      insert into musician_claims (user_id, musician_id)
      values (${userId}, ${musicianId})
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

export interface UserMusicianClaim {
  id: number;
  musician_name: string;
  musician_slug: string;
}

// The current user's own pending claim (if any), for display on /profile —
// "Your claim for <musician> is awaiting review".
export async function getPendingClaimForUser(userId: number): Promise<UserMusicianClaim | null> {
  const [row] = await sql<UserMusicianClaim[]>`
    select musician_claims.id, musicians.name as musician_name, musicians.slug as musician_slug
    from musician_claims
    join musicians on musicians.id = musician_claims.musician_id
    where musician_claims.user_id = ${userId} and musician_claims.status = 'pending'
    limit 1
  `;
  return row ?? null;
}

export async function listPendingMusicianClaims(): Promise<PendingMusicianClaim[]> {
  const rows = await sql<
    (MusicianClaim & {
      user_email: string;
      musician_name: string;
      musician_slug: string;
      band_name: string | null;
      band_slug: string | null;
    })[]
  >`
    select musician_claims.*, users.email as user_email,
           musicians.name as musician_name, musicians.slug as musician_slug,
           bands.name as band_name, bands.slug as band_slug
    from musician_claims
    join users on users.id = musician_claims.user_id
    join musicians on musicians.id = musician_claims.musician_id
    left join band_members on band_members.musician_id = musicians.id
    left join bands on bands.id = band_members.band_id
    where musician_claims.status = 'pending'
    order by musician_claims.created_at asc
  `;

  const map = new Map<number, PendingMusicianClaim>();
  for (const row of rows) {
    let claim = map.get(row.id);
    if (!claim) {
      const { band_name: _bandName, band_slug: _bandSlug, ...rest } = row;
      claim = { ...rest, bands: [] };
      map.set(row.id, claim);
    }
    if (row.band_name && row.band_slug) {
      claim.bands.push({ name: row.band_name, slug: row.band_slug });
    }
  }
  return [...map.values()];
}

// Approves or rejects a pending claim. Approval, in one transaction: sets
// musicians.user_id (guarded so it's still null — the musician may have been
// linked by a different, earlier-decided claim in the meantime), grants
// band_editors for every band the musician is a member of, and flips the
// claim's status. Returns null if the claim doesn't exist or is no longer
// pending. Throws MusicianAlreadyLinkedError if approving would violate the
// one-user-per-musician rule (surfaced to the admin instead of a 500).
export async function decideMusicianClaim(
  claimId: number,
  decision: "approved" | "rejected",
  adminUserId: number,
): Promise<MusicianClaim | null> {
  return sql.begin(async (tx) => {
    const [claim] = await tx<MusicianClaim[]>`
      update musician_claims
      set status = ${decision}, decided_at = now(), decided_by = ${adminUserId}
      where id = ${claimId} and status = 'pending'
      returning *
    `;
    if (!claim) return null;

    if (decision === "approved") {
      const [musician] = await tx<{ user_id: number | null }[]>`
        select user_id from musicians where id = ${claim.musician_id} limit 1
      `;
      if (musician?.user_id) {
        throw new MusicianAlreadyLinkedError();
      }

      await tx`
        update musicians set user_id = ${claim.user_id} where id = ${claim.musician_id}
      `;

      const bandIds = await tx<{ band_id: number }[]>`
        select band_id from band_members where musician_id = ${claim.musician_id}
      `;
      for (const { band_id } of bandIds) {
        await tx`
          insert into band_editors (user_id, band_id)
          values (${claim.user_id}, ${band_id})
          on conflict (user_id, band_id) do nothing
        `;
      }
    }

    return claim;
  });
}
