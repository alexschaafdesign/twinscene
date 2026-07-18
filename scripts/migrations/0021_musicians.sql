-- Musicians Slice 1: turns the free-text `bands.members` (jsonb array of name
-- strings, added in 0014) into real entities. `bands.members` is NOT touched
-- here or dropped — it stays as a frozen backup while scripts/backfill_musicians.mjs
-- and the rewired display/edit paths land on top of these new tables.
--
-- musicians    — one row per distinct person, deduped case-insensitively at
--                backfill time (two bands both listing "Alex" resolve to one
--                musician). `user_id` is nullable and unique: Slice 2 (a user
--                claiming/linking to their musician row) sets it once, but it
--                has no value yet — every row starts unlinked.
-- band_members — join table recording which musicians are in which bands.
--                `role` (instrument/vocal credit) is nullable because the
--                source data (comma-joined name strings) never carried it;
--                `position` preserves the original members-array order so
--                rendering doesn't shuffle relative to today's UI.
create table musicians (
  id         bigint generated always as identity primary key,
  name       text not null,
  slug       text unique not null,
  user_id    bigint unique references users(id) on delete set null,
  bio        text,
  image_url  text,
  created_at timestamptz not null default now()
);

create index musicians_name_lower_idx on musicians (lower(name));

create table band_members (
  band_id     bigint not null references bands(id) on delete cascade,
  musician_id bigint not null references musicians(id) on delete cascade,
  role        text,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (band_id, musician_id)
);

create index band_members_musician_idx on band_members (musician_id);
