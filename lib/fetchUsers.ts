// Read model for the admin users view (app/admin/users). One row per account
// with the display columns plus a few derived counts, so the page needs no
// per-row follow-up queries. Admin-gated at the page; this file is just the
// query.

import { sql } from "./db.ts";

export interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  username: string | null;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string | null;
  // Newest session's created_at — a coarse "last fresh login". Distinct from
  // last_seen_at (throttled per-request activity); shown as a fallback for
  // rows created before last_seen_at shipped. Null if the user has no session.
  last_session_at: string | null;
  editor_count: number; // bands this user may edit (band_editors rows)
  claim_count: number; // band claims this user has filed (any status)
  saved_count: number; // bands this user has saved
}

// All users, newest account first. The correlated subqueries keep this a
// single round-trip; user counts here are small (hundreds, not millions), so
// the sub-selects are cheaper than the mental overhead of three GROUP BY joins.
export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  return sql<AdminUserRow[]>`
    select
      u.id,
      u.email,
      u.name,
      u.username,
      u.is_admin,
      u.created_at,
      u.last_seen_at,
      (select max(s.created_at) from sessions s where s.user_id = u.id) as last_session_at,
      (select count(*)::int from band_editors be where be.user_id = u.id) as editor_count,
      (select count(*)::int from band_claims bc where bc.user_id = u.id) as claim_count,
      (select count(*)::int from saved_bands sb where sb.user_id = u.id) as saved_count
    from users u
    order by u.created_at desc
  `;
}
