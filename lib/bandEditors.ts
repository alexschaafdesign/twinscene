// Admin-facing CRUD over `band_editors` — who besides an admin can edit a
// given band. The authorization check itself (`canEditBand`) lives in
// lib/auth.ts; this module only manages the assignment rows admins create.

import { sql } from "./db.ts";
import { findOrCreateUserByEmail } from "./auth.ts";

export interface BandEditor {
  user_id: number;
  band_id: number;
  role: string;
  created_at: string;
  email: string;
  name: string | null;
}

export async function listBandEditors(bandId: number): Promise<BandEditor[]> {
  return sql<BandEditor[]>`
    select band_editors.user_id, band_editors.band_id, band_editors.role, band_editors.created_at,
           users.email, users.name
    from band_editors
    join users on users.id = band_editors.user_id
    where band_editors.band_id = ${bandId}
    order by band_editors.created_at asc
  `;
}

// Grants `email` editor access to `bandId`, creating the user row if this is
// their first appearance in the system. Idempotent: re-assigning an existing
// editor updates their role (a no-op if unchanged) rather than erroring.
export async function addBandEditor(
  bandId: number,
  email: string,
  role: string = "editor",
): Promise<BandEditor> {
  return sql.begin(async (tx) => {
    const user = await findOrCreateUserByEmail(email, tx);

    const [row] = await tx<BandEditor[]>`
      insert into band_editors (user_id, band_id, role)
      values (${user.id}, ${bandId}, ${role})
      on conflict (user_id, band_id) do update set role = excluded.role
      returning user_id, band_id, role, created_at
    `;
    return { ...row, email: user.email, name: user.name };
  });
}

export async function removeBandEditor(bandId: number, userId: number): Promise<void> {
  await sql`delete from band_editors where band_id = ${bandId} and user_id = ${userId}`;
}
