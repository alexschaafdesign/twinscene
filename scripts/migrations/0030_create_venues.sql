-- Venues move off the public Google Sheet and into Twin Scene's canonical
-- `venues` table, mirroring how `bands` was migrated (0009_create_bands_api.sql).
-- No new api_clients/rate_limits rows or tables are needed here — venues
-- reuse the existing public-API auth gate (any valid api_clients key
-- authorizes a GET), so this migration is schema-only.
create table venues (
  id             bigserial primary key,
  slug           text unique not null,
  name           text not null,
  city           text,
  neighborhood   text,
  capacity       integer,
  contact        text,
  notes          text,
  parking        text,
  accessibility  text,
  owner          text,
  type           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
