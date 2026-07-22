// Profile identity: display name, unique username, bio. Separate from
// lib/auth.ts (which owns sessions/login/authorization) — this is the
// user-editable profile-fields layer Phase 3 slice B adds on top.

import postgres from "postgres";
import { sql } from "./db.ts";
import type { User } from "./auth.ts";

// Either the top-level `sql` or a transaction handle from `sql.begin` — so the
// default-username assignment can run inside the same transaction that creates
// the user row (see lib/auth.ts upsertUserByEmail).
type QueryExecutor = postgres.Sql | postgres.TransactionSql;

/** Shapes a raw `users` row (from `select *` / `returning *`) into the public
 * `User` the rest of the app passes around: strips the sensitive argon2id
 * `password_hash` column entirely and replaces it with a derived
 * `has_password` boolean. Password auth (migration 0038) added password_hash
 * to the table, so every place that reads a whole user row must run it through
 * here before the object can reach an API response or a client component — the
 * raw hash must never leave the server's auth paths. Runtime key-strip with a
 * cast because `returning *` rows aren't statically typed with the column. */
export function scrubUser(row: object): User {
  // Also drop unsubscribe_token (migration 0055): a per-user secret that backs
  // the no-login email-unsubscribe link. Like password_hash, it should never
  // ride along in the User object the app passes around / hands to clients —
  // the email dispatcher reads it with its own targeted query instead.
  const { password_hash, unsubscribe_token, ...rest } = row as Record<string, unknown>;
  void unsubscribe_token;
  return { ...rest, has_password: password_hash != null } as unknown as User;
}

// 3-30 chars total, must start with a letter/number, rest is
// letters/digits/underscore/hyphen. Case-insensitive (the `i` flag) — casing
// is preserved as typed, but validated the same either way; uniqueness is
// enforced separately via lower(username).
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/i;

const MAX_BIO_LENGTH = 280;

// One line, in the spirit of the old Facebook "[name] is ..." box — long
// enough for a thought, short enough that it can't become a second bio.
export const MAX_STATUS_LENGTH = 140;

// Names that would collide with an existing or future top-level route once
// public profiles land at /u/[username] (see app/ for the current route
// list: admin, api, bands, login, musicians, playlists, profile, shows,
// submit, venues) plus other obvious reservations.
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "login",
  "logout",
  "signin",
  "signup",
  "forgot",
  "reset",
  "verify",
  "profile",
  "settings",
  "account",
  "bands",
  "band",
  "shows",
  "show",
  "musicians",
  "musician",
  "playlists",
  "playlist",
  "venues",
  "venue",
  "submit",
  "feed",
  "claim",
  "claims",
  "edit",
  "new",
  "u",
  "about",
  "help",
  "contact",
  "terms",
  "privacy",
  "static",
  "public",
  "assets",
  "favicon",
  "robots",
  "sitemap",
]);

export class UsernameTakenError extends Error {
  constructor() {
    super("That username is taken");
  }
}

export class InvalidUsernameError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidBioError extends Error {
  constructor() {
    super(`Bio must be ${MAX_BIO_LENGTH} characters or fewer`);
  }
}

export class InvalidStatusError extends Error {
  constructor() {
    super(`Status must be ${MAX_STATUS_LENGTH} characters or fewer`);
  }
}

/** Throws InvalidUsernameError if `raw` isn't a well-formed, non-reserved
 * username. Doesn't check availability — that's a DB round-trip, done by the
 * unique index + catch in updateProfile. */
function validateUsername(raw: string): string {
  const username = raw.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new InvalidUsernameError(
      "Usernames must be 3-30 characters, start with a letter or number, and contain only letters, numbers, underscores, and hyphens",
    );
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    throw new InvalidUsernameError("That username isn't available");
  }
  return username;
}

/** Turns an email into a starting-point username slug that satisfies
 * USERNAME_PATTERN (3-30 chars, starts alphanumeric, only [a-z0-9_-]). Drops
 * any `+tag`, lowercases, strips characters the pattern forbids (dots, etc.),
 * and pads very short results so the base is always valid on its own — the
 * caller handles reserved names and collisions. "j.doe+shows@x.io" → "jdoe". */
function deriveUsernameBase(email: string): string {
  const local = email.split("@")[0]?.split("+")[0]?.toLowerCase() ?? "";
  let base = local
    .replace(/[^a-z0-9_-]/g, "") // drop dots and anything else the pattern rejects
    .replace(/^[_-]+/, "") // must start with a letter or number
    .replace(/[_-]+$/, ""); // trailing separators read as typos
  if (base.length < 3) base = `${base}user`; // e.g. "" → "user", "j" → "juser"
  return base.slice(0, 30);
}

/** Gives a freshly created (or username-less) user a default username derived
 * from their email, guaranteeing uniqueness against the lower(username) index
 * by appending an incrementing suffix on collision, and skipping reserved
 * names. Meant to run at signup so every account has a working /u/[username]
 * and a grammatical "[name] is …" line from the start; the user can rename it
 * later in /profile/edit. The final fallback keys off the always-unique id, so
 * this can't fail to assign something. */
export async function assignDefaultUsername(
  userId: number,
  email: string,
  exec: QueryExecutor = sql,
): Promise<User> {
  const base = deriveUsernameBase(email);

  for (let n = 0; n < 100; n++) {
    let candidate = base;
    if (n > 0) {
      const suffix = String(n + 1);
      candidate = base.slice(0, 30 - suffix.length) + suffix;
    }
    if (RESERVED_USERNAMES.has(candidate.toLowerCase())) continue;
    try {
      const [user] = await exec<User[]>`
        update users set username = ${candidate} where id = ${userId} returning *
      `;
      if (!user) throw new Error(`lib/users: no user with id ${userId}`);
      return scrubUser(user);
    } catch (err) {
      // 23505 = unique violation on lower(username): taken, try the next suffix.
      if (err && typeof err === "object" && "code" in err && err.code === "23505") continue;
      throw err;
    }
  }

  // Astronomically unlikely to get here — `user-<id>` is unique by construction.
  const [user] = await exec<User[]>`
    update users set username = ${`user-${userId}`} where id = ${userId} returning *
  `;
  if (!user) throw new Error(`lib/users: no user with id ${userId}`);
  return scrubUser(user);
}

export interface ProfileUpdate {
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  profile_public?: boolean;
  show_bio?: boolean;
  show_status?: boolean;
  show_followed_bands?: boolean;
  show_attended_shows?: boolean;
  notify_email_messages?: boolean;
  // Saved home location. The route handler geocodes home_address before
  // calling us; we just persist the trio (or clear all three when the user
  // removes their address). home_lat/home_lng are null when geocoding failed.
  home_address?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
}

const VISIBILITY_FIELDS = [
  "show_bio",
  "show_status",
  "show_followed_bands",
  "show_attended_shows",
] as const;

/** Updates the caller's own profile fields. Any of name/username/bio may be
 * omitted (left unchanged) or set to null/empty to clear. Throws
 * InvalidUsernameError, InvalidBioError, or UsernameTakenError (the last one
 * covering both the pre-check and — since two requests can race between the
 * check and the insert — a unique-violation from the DB itself). */
export async function updateProfile(userId: number, update: ProfileUpdate): Promise<User> {
  const name = update.name === undefined ? undefined : update.name?.trim() || null;

  let username: string | null | undefined = update.username;
  if (username !== undefined) {
    username = username?.trim() ? validateUsername(username.trim()) : null;
  }

  let bio: string | null | undefined = update.bio;
  if (bio !== undefined) {
    bio = bio?.trim() || null;
    if (bio && bio.length > MAX_BIO_LENGTH) {
      throw new InvalidBioError();
    }
  }

  const fields: Partial<
    Record<
      | "name"
      | "username"
      | "bio"
      | "profile_public"
      | "notify_email_messages"
      | "home_address"
      | "home_lat"
      | "home_lng"
      | (typeof VISIBILITY_FIELDS)[number],
      string | number | null | boolean
    >
  > = {};
  if (name !== undefined) fields.name = name;
  if (username !== undefined) fields.username = username;
  if (bio !== undefined) fields.bio = bio;
  if (update.profile_public !== undefined) fields.profile_public = update.profile_public;
  if (update.notify_email_messages !== undefined) fields.notify_email_messages = update.notify_email_messages;
  if (update.home_address !== undefined) fields.home_address = update.home_address;
  if (update.home_lat !== undefined) fields.home_lat = update.home_lat;
  if (update.home_lng !== undefined) fields.home_lng = update.home_lng;
  for (const key of VISIBILITY_FIELDS) {
    if (update[key] !== undefined) fields[key] = update[key];
  }

  if (Object.keys(fields).length === 0) {
    const [user] = await sql<User[]>`select * from users where id = ${userId}`;
    if (!user) throw new Error(`lib/users: no user with id ${userId}`);
    return scrubUser(user);
  }

  try {
    const [user] = await sql<User[]>`
      update users set ${sql(fields)} where id = ${userId} returning *
    `;
    if (!user) throw new Error(`lib/users: no user with id ${userId}`);
    return scrubUser(user);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new UsernameTakenError();
    }
    throw err;
  }
}

/** One-click, no-login unsubscribe from message emails (migration 0055). The
 * token in the email footer identifies the user; redeeming it flips
 * notify_email_messages off. Idempotent and safe to hit repeatedly (e.g. an
 * email client prefetching the link). Returns the user's display name on
 * success, or null if the token matches no one — the page shows a generic
 * result either way, so a bad/expired-looking token leaks nothing. */
export async function unsubscribeMessageEmails(token: string): Promise<{ name: string | null } | null> {
  // Guard against a non-uuid token reaching the query (uuid = text comparison
  // would error); the column is uuid so only a well-formed value can match.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const [user] = await sql<{ name: string | null }[]>`
    update users set notify_email_messages = false
    where unsubscribe_token = ${token}
    returning name
  `;
  return user ?? null;
}

/** Sets (or clears, with an empty/whitespace string) the caller's own status.
 * Whitespace — including pasted newlines — collapses to single spaces, since
 * this renders as one line after "[name] is". Clearing nulls status_at too,
 * so there's never a timestamp without a status to date. */
export async function setStatus(userId: number, raw: string | null): Promise<User> {
  const status = raw?.replace(/\s+/g, " ").trim() || null;
  if (status && status.length > MAX_STATUS_LENGTH) {
    throw new InvalidStatusError();
  }

  const [user] = await sql<User[]>`
    update users
    set status = ${status}, status_at = ${status ? sql`now()` : null}
    where id = ${userId}
    returning *
  `;
  if (!user) throw new Error(`lib/users: no user with id ${userId}`);
  return scrubUser(user);
}

export interface PublicProfileUser {
  id: number;
  username: string;
  name: string | null;
  bio: string | null;
  status: string | null;
  status_at: string | null;
  image_url: string | null;
  profile_public: boolean;
  show_bio: boolean;
  show_status: boolean;
  show_followed_bands: boolean;
  show_attended_shows: boolean;
}

/** Looks up a user by username for the public profile page
 * (app/u/[username]) — an explicit column list, deliberately never including
 * email, so this can safely back an unauthenticated route regardless of the
 * viewer or the profile's privacy setting. Case-insensitive, matching the
 * lower(username) unique index from migration 0019. */
export async function getUserByUsername(username: string): Promise<PublicProfileUser | null> {
  const [user] = await sql<PublicProfileUser[]>`
    select
      id, username, name, bio, status, status_at, image_url, profile_public,
      show_bio, show_status, show_followed_bands, show_attended_shows
    from users
    where lower(username) = lower(${username})
    limit 1
  `;
  return user ?? null;
}

/** Points a user's image_url at a freshly uploaded avatar. The upload itself
 * (validate, resize via sharp, put to R2) happens in the route handler via
 * lib/r2.ts; the caller is responsible for deleting the previous avatar
 * object (it has the old URL from getCurrentUser, this function doesn't). */
export async function setAvatar(userId: number, imageUrl: string): Promise<User> {
  const [user] = await sql<User[]>`
    update users set image_url = ${imageUrl} where id = ${userId} returning *
  `;
  if (!user) throw new Error(`lib/users: no user with id ${userId}`);
  return scrubUser(user);
}
