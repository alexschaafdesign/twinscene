// Password hashing for the email + password login option (added alongside,
// not replacing, magic-link login). argon2id via @node-rs/argon2 — a Rust
// binding with prebuilt binaries, so there's no node-gyp/native-compile step
// to break on Vercel's build. Chosen per the repo guardrail "passwords, if
// ever added: argon2id/bcrypt, never plaintext" (docs/architecture.md).
//
// The stored value is the full PHC string ($argon2id$v=19$m=...$salt$hash) —
// salt and parameters travel with the hash, so verify() needs nothing else and
// the cost parameters can be raised later without a schema change.

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// Floor only — a UX guard against trivially guessable passwords, not a
// strength meter. We deliberately don't impose composition rules (they push
// users toward predictable patterns); length is the lever that matters.
const MIN_PASSWORD_LENGTH = 8;

// Upper bound so an attacker can't hand us a multi-megabyte string to burn CPU
// hashing. argon2id has no inherent input cap, so we set one well above any
// real passphrase.
const MAX_PASSWORD_LENGTH = 200;

// A valid argon2id hash of a throwaway string, used ONLY to equalize timing:
// when a login comes in for an email with no account (or no password set), the
// route still runs a verify against this so its response time matches the
// wrong-password case, closing a timing side-channel that would otherwise leak
// which emails have password logins. Never matches any real password.
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$NNyXICVzhcN7+UdRPRUJ5A$TjwwISok57teQNGWNoRh+bW8M2QcRSgOt1zVSmPFkj8";

export class InvalidPasswordError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// Throws InvalidPasswordError if the plaintext is too short or too long.
// Returns the password unchanged (never trimmed — leading/trailing spaces are
// legitimate password characters) so callers can validate-then-hash in one go.
export function validatePassword(plain: unknown): string {
  if (typeof plain !== "string") {
    throw new InvalidPasswordError("Enter a password");
  }
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidPasswordError(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`);
  }
  return plain;
}

// Hashes a plaintext password with argon2id. Validates length first, so a
// caller can pass raw user input straight through. Uses the library's default
// argon2id parameters, which are sensible for interactive login.
export async function hashPassword(plain: string): Promise<string> {
  validatePassword(plain);
  return argonHash(plain);
}

// Constant-time verify of a plaintext against a stored argon2id hash. argon2's
// verify is timing-safe by construction. Returns false (never throws) on a
// malformed/foreign hash string, so a corrupt stored value reads as "wrong
// password" rather than a 500.
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}
