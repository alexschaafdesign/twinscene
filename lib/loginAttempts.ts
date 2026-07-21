// Failure-based lockout for the password login + signup endpoints, backed by
// the login_attempts table (migration 0038). Distinct from lib/authRateLimit.ts
// (the fixed-window counter guarding the magic-link send): that throttles how
// often you can *ask* for a link; this counts *failed* password attempts per
// (email, ip) and locks the pair out for a cooldown once too many pile up,
// clearing the streak the moment a correct password comes through.
//
// DB-backed because each serverless invocation is its own process — there's no
// shared memory to hold a counter across lambdas.

import { sql } from "./db.ts";

// N failures in the trailing window → locked. Tuned so a person fat-fingering
// their password a few times is fine, but online guessing is throttled hard.
// The pair is (email, ip): guessing one account from one source trips it, while
// a legit user on a shared NAT isn't locked out by a stranger's typos elsewhere
// (different email) — and a single attacker rotating emails from one IP still
// gets caught by the magic-link/per-IP limiter on the other endpoints.
const MAX_FAILURES = 8;
const WINDOW_SECONDS = 15 * 60;

// Records the outcome of a password attempt. A success also clears that pair's
// prior failures so the next session starts from zero — a legit login shouldn't
// leave the user one typo away from a lockout. Best-effort pruning of old rows
// on each write keeps the table from growing without a cleanup cron.
export async function recordLoginAttempt(email: string, ip: string, succeeded: boolean): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await sql`
    insert into login_attempts (email, ip, succeeded)
    values (${normalizedEmail}, ${ip}, ${succeeded})
  `;
  if (succeeded) {
    await sql`
      delete from login_attempts
      where email = ${normalizedEmail} and ip = ${ip} and succeeded = false
    `;
  }
  await sql`delete from login_attempts where attempted_at < now() - interval '1 day'`;
}

// True when this (email, ip) has hit the failure ceiling inside the window and
// should be turned away before we even check the password. Counts only
// failures (successes are cleared by recordLoginAttempt), so a working account
// is never locked by its own history.
export async function isLockedOut(email: string, ip: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await sql<Array<{ count: number }>>`
    select count(*)::int as count
    from login_attempts
    where email = ${normalizedEmail}
      and ip = ${ip}
      and succeeded = false
      and attempted_at > now() - ${`${WINDOW_SECONDS} seconds`}::interval
  `;
  return row.count >= MAX_FAILURES;
}
