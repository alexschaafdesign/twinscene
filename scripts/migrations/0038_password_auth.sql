-- Email + password login, added ALONGSIDE the existing magic-link flow (not a
-- replacement — both issue the same sessions row on success). Additive only.
--
-- Design notes (fuller version in docs/auth-and-db.md):
--   * password_hash is argon2id (lib/password.ts), null for every account that
--     has never set one — i.e. all existing magic-link users. A null hash means
--     "no password login for this account"; the password-login path rejects it
--     with the same generic error it uses for a wrong password (no enumeration).
--   * email_verified_at gates password LOGIN only. Magic-link login already
--     proves email ownership, so every pre-existing user is backfilled verified
--     (= created_at). New password signups start null and verify via an emailed
--     token before they can log in with a password.
--   * login_tokens gains a `type` so the one hashed/single-use/~15-min token
--     mechanism serves all three link kinds: 'login' (magic link), 'verify'
--     (confirm a new password signup), 'reset' (set/change password). Existing
--     rows are all magic-link tokens, so the 'login' default is correct for
--     them and the current insert/lookup paths keep working unchanged.

alter table users add column password_hash text;
alter table users add column email_verified_at timestamptz;

-- Backfill: existing accounts logged in via magic link, which already proved
-- they control the address. Mark them verified as of when they were created so
-- password adoption (via "forgot password") and any future re-login isn't
-- blocked on a verification step they've effectively already passed.
update users set email_verified_at = created_at where email_verified_at is null;

-- Purpose tag on the shared login-token machinery. NOT NULL DEFAULT 'login'
-- means every pre-existing row (all magic-link tokens) reads correctly and the
-- current insert in requestLoginLink (which omits the column) still lands as
-- 'login'. Token consumption is scoped by type in code so a 'reset' link can't
-- be redeemed as a 'login', etc.
alter table login_tokens add column type text not null default 'login';

-- Per-(email, ip) attempt log backing the password login/signup lockout.
-- DB-backed rather than in-memory because each serverless invocation is its
-- own process — there's no shared RAM to hold a counter across lambdas. We
-- store the outcome so a successful login can clear the failure streak and the
-- limiter only ever counts *failed* attempts in the window (see
-- lib/loginAttempts.ts). No secrets live here beyond the email/ip themselves.
create table login_attempts (
  id           bigserial primary key,
  email        text not null,
  ip           text not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

-- Serves the lockout lookup: recent failures for one (email, ip). attempted_at
-- trails the equality columns so the window scan is index-ordered.
create index login_attempts_email_ip_idx on login_attempts (email, ip, attempted_at);
