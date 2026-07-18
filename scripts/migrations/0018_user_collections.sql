-- Phase 3 schema: all three of a user's personal-collection tables land in one
-- migration so the shape settles now, even though slice 1 (this phase) only
-- wires up saved_bands. band_follows and show_saves sit unused until later
-- slices — same "create everything, build incrementally" approach 0016 used
-- for band_editors.
--
-- bands.id is bigserial (bigint) — see 0009. shows.id is uuid, generated via
-- gen_random_uuid() — see 0001 — so show_saves.show_id is uuid, not bigint.
--
-- Each table is a pure (user, thing) join with no surrogate id: the natural
-- primary key doubles as the uniqueness constraint, so re-saving/re-following
-- the same thing is just an upsert (ON CONFLICT DO NOTHING) rather than a
-- duplicate-check-then-insert race.

create table saved_bands (
  user_id    bigint not null references users(id) on delete cascade,
  band_id    bigint not null references bands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, band_id)
);

-- Serves "how many users saved this band" without a full-table scan; the
-- primary key (user_id, band_id) doesn't help a lookup keyed by band_id alone.
create index saved_bands_band_id_idx on saved_bands (band_id);

create table band_follows (
  user_id    bigint not null references users(id) on delete cascade,
  band_id    bigint not null references bands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, band_id)
);

create table show_saves (
  user_id    bigint not null references users(id) on delete cascade,
  show_id    uuid   not null references shows(id) on delete cascade,
  status     text   not null,            -- 'interested' | 'going' | 'went'
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);
