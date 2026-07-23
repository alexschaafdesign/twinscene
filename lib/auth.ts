// Hand-rolled passwordless auth: magic-link login tokens, opaque session
// cookies, and the authorization rule for band editing. No auth library —
// matches the rest of the repo's raw-SQL-over-postgres.js approach
// (lib/db.ts, lib/apiAuth.ts).

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type postgres from "postgres";
import { sql } from "./db.ts";
import { sendEmail } from "./email.ts";
import { assignDefaultUsername, scrubUser } from "./users.ts";

export interface User {
  id: number;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  status: string | null;
  status_at: string | null;
  image_url: string | null;
  profile_public: boolean;
  show_bio: boolean;
  show_status: boolean;
  show_followed_bands: boolean;
  show_attended_shows: boolean;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string | null;
  // Saved home location (migration 0050), used to sort shows by distance.
  // home_lat/home_lng are geocoded from home_address on save; null until the
  // user sets an address. Private — excluded from the public profile
  // projection (getUserByUsername), so it never reaches an unauthenticated page.
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  // Set once the account's email is confirmed. Magic-link users are verified
  // by the act of clicking their link (backfilled to created_at for accounts
  // that predate migration 0038); password signups start null and verify via
  // an emailed token. Gates PASSWORD login only — magic link needs no separate
  // verification because the link itself proves ownership.
  email_verified_at: string | null;
  // Derived, never the hash itself: whether this account has a password set, so
  // the UI can offer "set a password" vs "change password". The argon2id
  // password_hash column is scrubbed out of every User the app hands around
  // (see scrubUser in lib/users.ts) — it never leaves lib/auth.ts's auth paths.
  has_password: boolean;
  // Email me when I receive a new message (migration 0055). Default on;
  // toggled from /profile/edit or the one-click unsubscribe link in the email.
  notify_email_messages: boolean;
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

// How stale users.last_seen_at may get before getCurrentUser refreshes it.
// Throttling to once per hour keeps "last seen" near-real-time for the admin
// users view while writing at most one UPDATE per active user per hour — not
// one per authenticated request.
const LAST_SEEN_THROTTLE_SECONDS = 60 * 60;

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --- Email link tokens (magic-link login, verify, reset) -------------------

// The single hashed/single-use/~15-min token mechanism (login_tokens) now
// carries a purpose, so one table backs all three emailed links:
//   'login'  — passwordless magic-link sign-in (the original use)
//   'verify' — confirm the email on a new password signup before it can log in
//   'reset'  — set or change a password ("forgot password" + first-password-set)
// Consumption is always scoped by type (consumeToken), so a link minted for one
// purpose can't be redeemed for another — a reset link can't silently log you
// in, an old login link can't set a password.
export type LoginTokenType = "login" | "verify" | "reset";

const TOKEN_TTL = "15 minutes";

// Mints a single-use token of `type` for `email`, storing only its SHA-256
// hash (the raw value lives solely in the emailed link). Returns the raw token
// so the caller can build the link. Shared by all three flows below.
async function createEmailToken(email: string, type: LoginTokenType): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomToken();
  await sql`
    insert into login_tokens (token, email, type, expires_at)
    values (${hashToken(rawToken)}, ${normalizedEmail}, ${type}, now() + ${TOKEN_TTL}::interval)
  `;
  return rawToken;
}

// Verifies and consumes a token of the given `type` (delete-returning, so it's
// single-use and atomic), yielding the email it was minted for, or null if the
// token is missing, the wrong type, already used, or expired.
export async function consumeToken(rawToken: string, type: LoginTokenType): Promise<string | null> {
  const [row] = await sql<{ email: string }[]>`
    delete from login_tokens
    where token = ${hashToken(rawToken)} and type = ${type} and expires_at > now()
    returning email
  `;
  return row?.email ?? null;
}

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
  const rawToken = await createEmailToken(normalizedEmail, "login");

  const safeNext = sanitizeNextPath(next);
  const link = `${origin}/api/auth/callback?token=${rawToken}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Sign in to Twin Scene",
    text: `Sign in to Twin Scene:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once.`,
    html: `<p><a href="${link}">Sign in to Twin Scene</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
  });
}

// Sends the email-verification link for a new password signup. Same hashed,
// single-use, 15-min token as the magic link, but type 'verify' — clicking it
// stamps email_verified_at and starts a session (app/api/auth/verify). `next`
// rides along so the post-verify redirect lands where they started.
export async function sendVerificationEmail(email: string, origin: string, next?: string | null): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = await createEmailToken(normalizedEmail, "verify");

  const safeNext = sanitizeNextPath(next);
  const link = `${origin}/api/auth/verify?token=${rawToken}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Confirm your email — Twin Scene",
    text: `Confirm your email to finish setting up your Twin Scene account:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once.`,
    html: `<p><a href="${link}">Confirm your email</a> to finish setting up your Twin Scene account.</p><p>This link expires in 15 minutes and can only be used once.</p>`,
  });
}

// Sends the password-reset link (type 'reset'). Drives both true resets and
// first-password-set for existing magic-link accounts. The link lands on the
// /reset page (not an API route) so the user can type a new password; that page
// posts the token back to app/api/auth/reset.
export async function sendPasswordResetEmail(email: string, origin: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = await createEmailToken(normalizedEmail, "reset");

  const link = `${origin}/reset?token=${rawToken}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Reset your password — Twin Scene",
    text: `Set a new Twin Scene password:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once. If you didn't request this, you can ignore this email.`,
    html: `<p><a href="${link}">Set a new password</a> for your Twin Scene account.</p><p>This link expires in 15 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>`,
  });
}

// Sent when someone tries to sign up (or reset) an address that already has a
// verified account. Reveals nothing to the requester (the endpoints always
// return the same generic response) — this just helps the real owner, who
// controls the inbox, sign in. No token: it points at the sign-in page.
export async function sendAccountExistsEmail(email: string, origin: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const link = `${origin}/login`;
  await sendEmail({
    to: normalizedEmail,
    subject: "You already have a Twin Scene account",
    text: `Someone (hopefully you) tried to sign up with this email, but you already have a Twin Scene account.\n\nSign in here: ${link}\n\nForgot your password? Use the "Forgot password" link on that page. If this wasn't you, you can ignore this email.`,
    html: `<p>Someone (hopefully you) tried to sign up with this email, but you already have a Twin Scene account.</p><p><a href="${link}">Sign in</a> — and use the "Forgot password" link there if you need to reset it. If this wasn't you, you can ignore this email.</p>`,
  });
}

// Upserts a `users` row by email, reporting whether the row was newly created.
// The `(xmax = 0)` flag is Postgres's standard "was this an INSERT?" trick:
// freshly inserted rows have xmax 0, rows that took the ON CONFLICT update
// path do not — which lets the login callback show first-time users a welcome
// screen without a second round-trip.
async function upsertUserByEmail(
  email: string,
  tx: QueryExecutor = sql,
): Promise<{ user: User; isNew: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await tx<(User & { is_new: boolean })[]>`
    insert into users (email)
    values (${normalizedEmail})
    on conflict (email) do update set email = excluded.email
    returning *, (xmax = 0) as is_new
  `;
  const { is_new, ...rawUser } = row;
  const user = scrubUser(rawUser);

  // Give every account a default username derived from its email, so the
  // public /u/[username] URL and the "[name] is …" status line work from the
  // first login. Gated on a missing username rather than is_new, which also
  // backfills older accounts created before this existed — the next time they
  // log in they pick one up (and can rename it in /profile/edit). A user who
  // deliberately cleared their username would get a fresh default here, an edge
  // case we accept since a null username is a broken profile either way.
  if (!user.username) {
    const withUsername = await assignDefaultUsername(user.id, normalizedEmail, tx);
    return { user: withUsername, isNew: is_new };
  }

  return { user, isNew: is_new };
}

// Upserts a `users` row by email — creates it if new, otherwise returns the
// existing row untouched. Shared by the login callback (a user's first
// sign-in creates their row) and admin band-editor assignment (granting
// access to an email that hasn't logged in yet still needs a users row for
// band_editors to reference).
export async function findOrCreateUserByEmail(email: string, tx: QueryExecutor = sql): Promise<User> {
  const { user } = await upsertUserByEmail(email, tx);
  return user;
}

// Verifies a raw login token, consumes it (deletes it, single-use), and
// upserts the corresponding `users` row by email. Returns null if the token
// is missing, already used, or expired — otherwise the user plus whether this
// sign-in just created their account (drives the one-time welcome screen).
export async function consumeLoginToken(
  rawToken: string,
): Promise<{ user: User; isNew: boolean } | null> {
  const tokenHash = hashToken(rawToken);

  return sql.begin(async (tx) => {
    const [tokenRow] = await tx<{ email: string }[]>`
      delete from login_tokens
      where token = ${tokenHash} and type = 'login' and expires_at > now()
      returning email
    `;
    if (!tokenRow) return null;

    const result = await upsertUserByEmail(tokenRow.email, tx);

    // Clicking a magic link proves control of the address, so a magic-link
    // sign-in is also an email verification — stamp it if not already set (a
    // no-op for existing/backfilled users). Keeps the invariant that anyone who
    // has ever completed a magic-link login counts as verified, so they're
    // never blocked from later adding a password.
    if (!result.user.email_verified_at) {
      const [row] = await tx<{ email_verified_at: string }[]>`
        update users set email_verified_at = now() where id = ${result.user.id}
        returning email_verified_at
      `;
      result.user.email_verified_at = row?.email_verified_at ?? null;
    }

    return result;
  });
}

// --- Password auth ---------------------------------------------------------

// The one place password_hash is deliberately read back out — for verifying a
// login and for the "does this account have a password / is it verified"
// branching in signup and change-password. Returns just the auth-relevant
// columns (never a full User), so the raw hash stays confined to the auth
// paths that actually need it. null when no such user exists.
export async function getUserAuthByEmail(
  email: string,
): Promise<{ id: number; password_hash: string | null; email_verified_at: string | null } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await sql<{ id: number; password_hash: string | null; email_verified_at: string | null }[]>`
    select id, password_hash, email_verified_at from users where email = ${normalizedEmail} limit 1
  `;
  return row ?? null;
}

// Creates a brand-new account for a password signup: unverified
// (email_verified_at null — verification happens via the emailed token) with
// the given argon2id hash, plus a default username like every other account.
// Race-safe via ON CONFLICT DO NOTHING: if the email already exists we return
// isNew=false and DON'T touch the existing row — an unauthenticated request
// must never overwrite an existing account's password (takeover guard). The
// caller decides what to email based on isNew + the existing verification
// state.
export async function createPasswordUser(
  email: string,
  passwordHash: string,
): Promise<{ id: number; isNew: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  return sql.begin(async (tx) => {
    const [inserted] = await tx<{ id: number }[]>`
      insert into users (email, password_hash)
      values (${normalizedEmail}, ${passwordHash})
      on conflict (email) do nothing
      returning id
    `;
    if (!inserted) {
      const [existing] = await tx<{ id: number }[]>`select id from users where email = ${normalizedEmail}`;
      return { id: Number(existing.id), isNew: false };
    }
    await assignDefaultUsername(Number(inserted.id), normalizedEmail, tx);
    return { id: Number(inserted.id), isNew: true };
  });
}

// Marks an email verified (idempotent — coalesce keeps the original timestamp
// if already set). Returns the user id so the verify route can start a session,
// or null if no such user. Used by the email-verification link.
export async function markEmailVerified(email: string): Promise<{ id: number } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await sql<{ id: number }[]>`
    update users set email_verified_at = coalesce(email_verified_at, now())
    where email = ${normalizedEmail}
    returning id
  `;
  return row ? { id: Number(row.id) } : null;
}

// Sets an account's password from a redeemed reset token. A reset link proves
// control of the inbox, so this also verifies the email (coalesce keeps an
// existing timestamp) — that's what lets a password-less magic-link user adopt
// a password via "forgot password". Returns the user id for session creation.
export async function setPasswordByEmail(email: string, passwordHash: string): Promise<{ id: number } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await sql<{ id: number }[]>`
    update users
    set password_hash = ${passwordHash}, email_verified_at = coalesce(email_verified_at, now())
    where email = ${normalizedEmail}
    returning id
  `;
  return row ? { id: Number(row.id) } : null;
}

// Sets/changes the password of an already-authenticated user (from /profile).
// The caller has a valid session, so ownership is already proven — no token
// needed. Authorization to require the *current* password on a change is
// enforced at the route, which has the plaintext to verify.
export async function setPasswordForUser(userId: number, passwordHash: string): Promise<void> {
  await sql`update users set password_hash = ${passwordHash} where id = ${userId}`;
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
  const { expires_at, ...rawUser } = row;
  const user = scrubUser(rawUser);

  // Throttled last-seen stamp: only write when the recorded value is null or
  // older than the throttle window, so at most one UPDATE per user per hour.
  // Safe during Server Component render (unlike the cookie re-set below) — it's
  // a DB write, not a cookie write. Best-effort; a failure never blocks auth.
  const lastSeenMs = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
  if ((Date.now() - lastSeenMs) / 1000 > LAST_SEEN_THROTTLE_SECONDS) {
    try {
      await sql`update users set last_seen_at = now() where id = ${user.id}`;
    } catch {
      // Non-fatal — last_seen_at is a display convenience, not part of auth.
    }
  }

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

// Same rule as canEditBand, over media_pro_editors — mirrors bands'
// self-editing model for the photographer/videographer directory.
export async function canEditMediaPro(user: User | null, mediaProId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from media_pro_editors where user_id = ${user.id} and media_pro_id = ${mediaProId} limit 1
  `;
  return !!row;
}

// Same rule as canEditBand, over writer_editors — mirrors bands'/media pros'
// self-editing model for the music-writers directory (migration 0063).
export async function canEditWriter(user: User | null, writerId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from writer_editors where user_id = ${user.id} and writer_id = ${writerId} limit 1
  `;
  return !!row;
}

// Same rule as canEditBand, over venue_editors — mirrors bands'/media pros'
// self-editing model for the venue directory.
export async function canEditVenue(user: User | null, venueId: number): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;

  const [row] = await sql`
    select 1 from venue_editors where user_id = ${user.id} and venue_id = ${venueId} limit 1
  `;
  return !!row;
}

// Gate for admin-only routes/pages (assigning editors, deciding claims). A
// type guard so `if (!isAdmin(user)) return …` narrows `user` to non-null
// afterward, no `!` assertions needed at the call site.
export function isAdmin(user: User | null): user is User {
  return !!user?.is_admin;
}

export class LastAdminError extends Error {
  constructor() {
    super("Can't remove the last admin");
  }
}

// Grants or revokes users.is_admin — the "may edit ANY band" flag. Callers
// must have already checked isAdmin() on the *actor*; this function only
// knows about the target.
//
// The demotion path runs inside a transaction that locks every admin row
// first, so two concurrent demotions can't each see the other as the
// remaining admin and leave the site with none. Revoking is otherwise
// recoverable by hand in the DB, but a zero-admin site isn't recoverable
// from the UI at all.
export async function setUserAdmin(userId: number, makeAdmin: boolean): Promise<User> {
  if (makeAdmin) {
    const [user] = await sql<User[]>`
      update users set is_admin = true where id = ${userId} returning *
    `;
    if (!user) throw new Error(`lib/auth: no user with id ${userId}`);
    return scrubUser(user);
  }

  return sql.begin(async (tx) => {
    const admins = await tx<{ id: number }[]>`
      select id from users where is_admin = true for update
    `;
    if (admins.length <= 1 && admins.some((a) => Number(a.id) === userId)) {
      throw new LastAdminError();
    }

    const [user] = await tx<User[]>`
      update users set is_admin = false where id = ${userId} returning *
    `;
    if (!user) throw new Error(`lib/auth: no user with id ${userId}`);
    return scrubUser(user);
  });
}
