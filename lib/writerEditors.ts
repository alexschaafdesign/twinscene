// Admin-facing CRUD over `writer_editors` — who besides an admin can edit a
// given writer listing. The authorization check itself (`canEditWriter`) lives
// in lib/auth.ts; this module only manages the assignment rows admins create.
// Mirrors lib/mediaProEditors.ts.

import { sql } from "./db.ts";
import { findOrCreateUserByEmail } from "./auth.ts";

export interface WriterEditor {
  user_id: number;
  writer_id: number;
  role: string;
  created_at: string;
  email: string;
  name: string | null;
}

export async function listWriterEditors(writerId: number): Promise<WriterEditor[]> {
  return sql<WriterEditor[]>`
    select writer_editors.user_id, writer_editors.writer_id, writer_editors.role,
           writer_editors.created_at, users.email, users.name
    from writer_editors
    join users on users.id = writer_editors.user_id
    where writer_editors.writer_id = ${writerId}
    order by writer_editors.created_at asc
  `;
}

// Grants `email` editor access to `writerId`, creating the user row if this is
// their first appearance in the system. Idempotent: re-assigning an existing
// editor updates their role (a no-op if unchanged) rather than erroring.
export async function addWriterEditor(
  writerId: number,
  email: string,
  role: string = "editor",
): Promise<WriterEditor> {
  return sql.begin(async (tx) => {
    const user = await findOrCreateUserByEmail(email, tx);

    const [row] = await tx<WriterEditor[]>`
      insert into writer_editors (user_id, writer_id, role)
      values (${user.id}, ${writerId}, ${role})
      on conflict (user_id, writer_id) do update set role = excluded.role
      returning user_id, writer_id, role, created_at
    `;
    return { ...row, email: user.email, name: user.name };
  });
}

export async function removeWriterEditor(writerId: number, userId: number): Promise<void> {
  await sql`delete from writer_editors where writer_id = ${writerId} and user_id = ${userId}`;
}
