// Profile identity: display name, unique username, bio. Separate from
// lib/auth.ts (which owns sessions/login/authorization) — this is the
// user-editable profile-fields layer Phase 3 slice B adds on top.

import { sql } from "./db.ts";
import type { User } from "./auth.ts";

// 3-30 chars total, must start with a letter/number, rest is
// letters/digits/underscore/hyphen. Case-insensitive (the `i` flag) — casing
// is preserved as typed, but validated the same either way; uniqueness is
// enforced separately via lower(username).
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/i;

const MAX_BIO_LENGTH = 280;

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

export interface ProfileUpdate {
  name?: string | null;
  username?: string | null;
  bio?: string | null;
}

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

  const fields: Partial<Record<"name" | "username" | "bio", string | null>> = {};
  if (name !== undefined) fields.name = name;
  if (username !== undefined) fields.username = username;
  if (bio !== undefined) fields.bio = bio;

  if (Object.keys(fields).length === 0) {
    const [user] = await sql<User[]>`select * from users where id = ${userId}`;
    if (!user) throw new Error(`lib/users: no user with id ${userId}`);
    return user;
  }

  try {
    const [user] = await sql<User[]>`
      update users set ${sql(fields)} where id = ${userId} returning *
    `;
    if (!user) throw new Error(`lib/users: no user with id ${userId}`);
    return user;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new UsernameTakenError();
    }
    throw err;
  }
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
  return user;
}
