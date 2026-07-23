// Admin-facing CRUD over `comrade_editors` — who besides an admin can edit a
// given comrade listing. The authorization check itself (`canEditComrade`)
// lives in lib/auth.ts; this module only manages the assignment rows admins
// create. Mirrors lib/mediaProEditors.ts.

import { sql } from "./db.ts";
import { findOrCreateUserByEmail } from "./auth.ts";

export interface ComradeEditor {
  user_id: number;
  comrade_id: number;
  role: string;
  created_at: string;
  email: string;
  name: string | null;
}

export async function listComradeEditors(comradeId: number): Promise<ComradeEditor[]> {
  return sql<ComradeEditor[]>`
    select comrade_editors.user_id, comrade_editors.comrade_id, comrade_editors.role,
           comrade_editors.created_at, users.email, users.name
    from comrade_editors
    join users on users.id = comrade_editors.user_id
    where comrade_editors.comrade_id = ${comradeId}
    order by comrade_editors.created_at asc
  `;
}

// Grants `email` editor access to `comradeId`, creating the user row if
// this is their first appearance in the system. Idempotent: re-assigning an
// existing editor updates their role (a no-op if unchanged) rather than
// erroring.
export async function addComradeEditor(
  comradeId: number,
  email: string,
  role: string = "editor",
): Promise<ComradeEditor> {
  return sql.begin(async (tx) => {
    const user = await findOrCreateUserByEmail(email, tx);

    const [row] = await tx<ComradeEditor[]>`
      insert into comrade_editors (user_id, comrade_id, role)
      values (${user.id}, ${comradeId}, ${role})
      on conflict (user_id, comrade_id) do update set role = excluded.role
      returning user_id, comrade_id, role, created_at
    `;
    return { ...row, email: user.email, name: user.name };
  });
}

export async function removeComradeEditor(comradeId: number, userId: number): Promise<void> {
  await sql`delete from comrade_editors where comrade_id = ${comradeId} and user_id = ${userId}`;
}
