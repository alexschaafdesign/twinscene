-- Twin Scene becomes the canonical home for the shared band directory (this
-- data currently lives on Birdhaus; no data is migrated in this phase — schema
-- and API only, so `bands` starts empty).
--
-- `api_clients` gates the public /api/public/bands endpoints: only the SHA-256
-- hash of each key is stored, never the plaintext. `can_write` distinguishes
-- read-only consumers (crawlspace) from writers (birdhaus, which creates
-- unreviewed bands when matching scraped lineups).
--
-- `rate_limits` is a fixed-window, per-client, per-minute counter — one row per
-- (client, minute), incremented on each request.
create table bands (
  id           bigserial primary key,
  slug         text unique not null,
  name         text not null,
  unreviewed   boolean not null default false,
  genre        text,
  socials      jsonb,
  bio          text,
  hometown     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table api_clients (
  id            bigserial primary key,
  name          text not null,
  key_hash      text unique not null,
  can_write     boolean not null default false,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

create table rate_limits (
  client_id     bigint not null references api_clients(id),
  window_start  timestamptz not null,
  request_count int not null default 1,
  primary key (client_id, window_start)
);
