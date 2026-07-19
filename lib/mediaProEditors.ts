// Admin-facing CRUD over `media_pro_editors` — who besides an admin can edit
// a given media pro listing. The authorization check itself
// (`canEditMediaPro`) lives in lib/auth.ts; this module only manages the
// assignment rows admins create. Mirrors lib/bandEditors.ts.

import { sql } from "./db.ts";
import { findOrCreateUserByEmail } from "./auth.ts";

export interface MediaProEditor {
  user_id: number;
  media_pro_id: number;
  role: string;
  created_at: string;
  email: string;
  name: string | null;
}

export async function listMediaProEditors(mediaProId: number): Promise<MediaProEditor[]> {
  return sql<MediaProEditor[]>`
    select media_pro_editors.user_id, media_pro_editors.media_pro_id, media_pro_editors.role,
           media_pro_editors.created_at, users.email, users.name
    from media_pro_editors
    join users on users.id = media_pro_editors.user_id
    where media_pro_editors.media_pro_id = ${mediaProId}
    order by media_pro_editors.created_at asc
  `;
}

// Grants `email` editor access to `mediaProId`, creating the user row if
// this is their first appearance in the system. Idempotent: re-assigning an
// existing editor updates their role (a no-op if unchanged) rather than
// erroring.
export async function addMediaProEditor(
  mediaProId: number,
  email: string,
  role: string = "editor",
): Promise<MediaProEditor> {
  return sql.begin(async (tx) => {
    const user = await findOrCreateUserByEmail(email, tx);

    const [row] = await tx<MediaProEditor[]>`
      insert into media_pro_editors (user_id, media_pro_id, role)
      values (${user.id}, ${mediaProId}, ${role})
      on conflict (user_id, media_pro_id) do update set role = excluded.role
      returning user_id, media_pro_id, role, created_at
    `;
    return { ...row, email: user.email, name: user.name };
  });
}

export async function removeMediaProEditor(mediaProId: number, userId: number): Promise<void> {
  await sql`delete from media_pro_editors where media_pro_id = ${mediaProId} and user_id = ${userId}`;
}
