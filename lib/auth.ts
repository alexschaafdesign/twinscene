// Hand-rolled passwordless auth: magic-link login tokens, opaque session
// cookies, and the authorization rule for band editing. No auth library —
// matches the rest of the repo's raw-SQL-over-postgres.js approach
// (lib/db.ts, lib/apiAuth.ts).

import crypto from "node:crypto";
import { cookies } from "next/headers";
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

export const SESSION_COOKIE = "ts_session";

// Session cookie maxAge in seconds — kept in sync with the `interval '30
// days'` in createSession's insert below.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --- Magic-link login tokens -----------------------------------------------

// Creates a single-use login token for `email` and emails the sign-in link.
// Only the SHA-256 hash of the raw token is stored; the raw value exists
// only in the emailed URL and is never persisted.
export async function requestLoginLink(email: string, origin: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomToken();

  await sql`
    insert into login_tokens (token, email, expires_at)
    values (${hashToken(rawToken)}, ${normalizedEmail}, now() + interval '15 minutes')
  `;

  const link = `${origin}/api/auth/callback?token=${rawToken}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Sign in to Twin Scene",
    text: `Sign in to Twin Scene:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once.`,
    html: `<p><a href="${link}">Sign in to Twin Scene</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
  });
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

    const [user] = await tx<User[]>`
      insert into users (email)
      values (${tokenRow.email})
      on conflict (email) do update set email = excluded.email
      returning *
    `;
    return user;
  });
}

// --- Sessions ----------------------------------------------------------------

// Creates a session row and sets the HTTP-only session cookie. Call from a
// Route Handler or Server Function (where response cookies can be set).
export async function createSession(userId: number): Promise<void> {
  const sessionId = randomToken();
  await sql`
    insert into sessions (id, user_id, expires_at)
    values (${sessionId}, ${userId}, now() + interval '30 days')
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
// there's no session, it's expired, or it's been revoked.
export async function getCurrentUser(): Promise<User | null> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const [user] = await sql<User[]>`
    select users.*
    from sessions
    join users on users.id = sessions.user_id
    where sessions.id = ${sessionId} and sessions.expires_at > now()
    limit 1
  `;
  return user ?? null;
}

// --- Authorization -------------------------------------------------------

// The single rule for "can this user edit this band", everywhere. Phase 1
// only ever satisfies the is_admin branch — band_editors is created by this
// phase's migration but nothing assigns rows to it yet (Phase 2) — but the
// query already checks it so switching that phase on needs no change here.
export async function canEditBand(user: User | null, bandId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from band_editors where user_id = ${user.id} and band_id = ${bandId} limit 1
  `;
  return !!row;
}
