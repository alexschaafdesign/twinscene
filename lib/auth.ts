// Hand-rolled passwordless auth: magic-link login tokens, opaque session
// cookies, and the authorization rule for band editing. No auth library —
// matches the rest of the repo's raw-SQL-over-postgres.js approach
// (lib/db.ts, lib/apiAuth.ts).

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type postgres from "postgres";
import { sql } from "./db.ts";
import { sendEmail } from "./email.ts";

export interface User {
  id: number;
  email: string;
  name: string | null;
  image_url: string | null;
  is_admin: boolean;
  created_at: string;
}

// Either the top-level `sql` or a `tx` from `sql.begin` — postgres.js's Sql
// and TransactionSql are siblings, not one a subtype of the other, so a
// function usable both standalone and inside a transaction needs the union.
type QueryExecutor = postgres.Sql | postgres.TransactionSql;

export const SESSION_COOKIE = "ts_session";

// Session cookie maxAge in seconds — kept in sync with the `interval '90
// days'` in createSession's insert below. Long-lived so returning users
// essentially never have to re-auth.
const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

// Sliding-expiration threshold: once less than half the session's lifetime
// remains, getCurrentUser() pushes expires_at back out to a fresh 90 days.
// Comparing against expires_at (not created_at) means an already-renewed
// session won't re-renew again for another ~45 days.
const SESSION_RENEW_THRESHOLD_SECONDS = SESSION_TTL_SECONDS / 2;

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --- Magic-link login tokens -----------------------------------------------

// Only a same-origin relative path is ever safe to bounce a login redirect
// through — rejects absolute/protocol-relative URLs (open-redirect vector)
// and anything not starting with a single "/". Returns null for anything else,
// callers then fall back to "/".
export function sanitizeNextPath(next: string | undefined | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// Creates a single-use login token for `email` and emails the sign-in link.
// Only the SHA-256 hash of the raw token is stored; the raw value exists
// only in the emailed URL and is never persisted. `next`, when a valid
// relative path, rides along in the link's query string (not stored server
// side) so the callback route can redirect back there after verifying.
export async function requestLoginLink(email: string, origin: string, next?: string | null): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomToken();

  await sql`
    insert into login_tokens (token, email, expires_at)
    values (${hashToken(rawToken)}, ${normalizedEmail}, now() + interval '15 minutes')
  `;

  const safeNext = sanitizeNextPath(next);
  const link = `${origin}/api/auth/callback?token=${rawToken}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Sign in to Twin Scene",
    text: `Sign in to Twin Scene:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once.`,
    html: `<p><a href="${link}">Sign in to Twin Scene</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
  });
}

// Upserts a `users` row by email — creates it if new, otherwise returns the
// existing row untouched. Shared by the login callback (a user's first
// sign-in creates their row) and admin band-editor assignment (granting
// access to an email that hasn't logged in yet still needs a users row for
// band_editors to reference).
export async function findOrCreateUserByEmail(email: string, tx: QueryExecutor = sql): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await tx<User[]>`
    insert into users (email)
    values (${normalizedEmail})
    on conflict (email) do update set email = excluded.email
    returning *
  `;
  return user;
}

// Verifies a raw login token, consumes it (deletes it, single-use), and
// upserts the corresponding `users` row by email. Returns null if the token
// is missing, already used, or expired.
export async function consumeLoginToken(rawToken: string): Promise<User | null> {
  const tokenHash = hashToken(rawToken);

  return sql.begin(async (tx) => {
    const [tokenRow] = await tx<{ email: string }[]>`
      delete from login_tokens
      where token = ${tokenHash} and expires_at > now()
      returning email
    `;
    if (!tokenRow) return null;

    return findOrCreateUserByEmail(tokenRow.email, tx);
  });
}

// --- Sessions ----------------------------------------------------------------

// Creates a session row and sets the HTTP-only session cookie. Call from a
// Route Handler or Server Function (where response cookies can be set).
export async function createSession(userId: number): Promise<void> {
  const sessionId = randomToken();
  await sql`
    insert into sessions (id, user_id, expires_at)
    values (${sessionId}, ${userId}, now() + interval '90 days')
  `;

  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

// Deletes the current session row (if any) and clears the cookie.
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await sql`delete from sessions where id = ${sessionId}`;
  }
  store.delete(SESSION_COOKIE);
}

// Reads the session cookie and resolves the logged-in user, or null if
// there's no session, it's expired, or it's been revoked. Also implements
// sliding expiration: a session past the halfway point of its lifetime gets
// pushed back out to a fresh 90 days, so an active user is never logged out
// mid-use. The DB write always happens; the matching cookie re-set is
// best-effort, since Next.js only allows writing cookies from a Server
// Function or Route Handler, not while rendering a Server Component (e.g.
// this is called from the root layout on every page). Called from a Route
// Handler — which most authenticated actions in this app go through — the
// re-set succeeds and the browser's copy is renewed too.
export async function getCurrentUser(): Promise<User | null> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const [row] = await sql<(User & { expires_at: string })[]>`
    select users.*, sessions.expires_at
    from sessions
    join users on users.id = sessions.user_id
    where sessions.id = ${sessionId} and sessions.expires_at > now()
    limit 1
  `;
  if (!row) return null;
  const { expires_at, ...user } = row;

  const secondsRemaining = (new Date(expires_at).getTime() - Date.now()) / 1000;
  if (secondsRemaining < SESSION_RENEW_THRESHOLD_SECONDS) {
    await sql`update sessions set expires_at = now() + interval '90 days' where id = ${sessionId}`;
    try {
      (await cookies()).set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
    } catch {
      // Called during Server Component rendering — cookie writes aren't
      // allowed there. The DB row is still renewed; the cookie catches up
      // next time this resolves inside a Route Handler or Server Function.
    }
  }

  return user;
}

// --- Authorization -------------------------------------------------------

// The single rule for "can this user edit this band", everywhere.
// band_editors rows come from either admin assignment (lib/bandEditors.ts)
// or an approved claim (lib/bandClaims.ts).
export async function canEditBand(user: User | null, bandId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from band_editors where user_id = ${user.id} and band_id = ${bandId} limit 1
  `;
  return !!row;
}

// Gate for admin-only routes/pages (assigning editors, deciding claims). A
// type guard so `if (!isAdmin(user)) return …` narrows `user` to non-null
// afterward, no `!` assertions needed at the call site.
export function isAdmin(user: User | null): user is User {
  return !!user?.is_admin;
}
