-- Phase 1 of the auth system: passwordless (magic-link) login plus the
-- schema authorization will build on. Creates all four tables now so later
-- phases need no further schema churn, but only users/sessions/login_tokens
-- are wired up to any code this phase — band_editors sits unused until
-- Phase 2 adds per-band editor assignment.
--
-- Authorization model: `users.is_admin` can edit any band; `band_editors`
-- maps a non-admin user to specific bands they're allowed to edit. The rule
-- everywhere (lib/auth.ts canEditBand) is:
--   user.is_admin OR exists row in band_editors(user_id, band_id)
--
-- No passwords are ever stored — `login_tokens` backs a single-use magic
-- link (15 min expiry), `sessions` backs the resulting logged-in cookie.

create table users (
  id           bigserial primary key,
  email        text unique not null,
  name         text,
  image_url    text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table band_editors (
  user_id      bigint not null references users(id) on delete cascade,
  band_id      bigint not null references bands(id) on delete cascade,
  role         text not null default 'editor',
  created_at   timestamptz not null default now(),
  primary key (user_id, band_id)
);

-- id is the opaque session token itself (raw, not hashed) — the cookie value
-- IS the primary key, so validating a session is a single lookup.
create table sessions (
  id           text primary key,
  user_id      bigint not null references users(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- token is a SHA-256 hash of the raw single-use magic-link token mailed to
-- the user — mirrors how lib/apiAuth.ts stores api_clients.key_hash, never
-- the plaintext. Consumed (deleted) on first successful verify.
create table login_tokens (
  token        text primary key,
  email        text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
