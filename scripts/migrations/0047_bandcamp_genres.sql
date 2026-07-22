-- Bandcamp genre-tag enrichment. `genres` is the canonical, curated list;
-- `band_genres` links a band to canonical genres derived from raw source tags
-- (Bandcamp for now, hence source/raw_tag) with a confidence tier from the
-- Haiku normalization step (lib/scrapers/bandcampGenres.ts). Distinct from the
-- free-text bands.genre column, which is self-reported vanity text (see the
-- seed-list review: "a bunch", "weird dad music", etc.) — this is a
-- structured taxonomy meant to eventually back search/filter.
create table genres (
  id          bigserial primary key,
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- pk(band_id, genre_id, source): one row per band/genre/source combination,
-- so a band's tags can be re-scraped and upserted (ON CONFLICT DO UPDATE)
-- without duplicating rows as its Bandcamp tags change over time.
create table band_genres (
  band_id     bigint not null references bands(id) on delete cascade,
  genre_id    bigint not null references genres(id) on delete cascade,
  source      text not null default 'bandcamp',
  raw_tag     text not null,
  confidence  text not null check (confidence in ('high', 'medium', 'low')),
  created_at  timestamptz not null default now(),
  primary key (band_id, genre_id, source)
);

create index band_genres_genre_id_idx on band_genres (genre_id);

-- Seed list reviewed with Alex 2026-07-21: combines real Bandcamp tags pulled
-- from 7 bands' pages (Abalone, Conzemius, Public Service Announcement,
-- askSERPENT, Ben Noble, Creekbed Carter Hogan, friendlychaos) with the
-- highest-signal tokens from the existing free-text bands.genre column.
insert into genres (name) values
  ('Rock'), ('Alternative'), ('Indie Rock'), ('Art Rock'), ('Garage Rock'),
  ('Post-Rock'), ('Noise Rock'), ('Psych Rock'), ('Shoegaze'), ('Grunge'),
  ('Pop'), ('Indie Pop'), ('Dream Pop'), ('Synth Pop'), ('Pop Punk'),
  ('Folk'), ('Indie Folk'), ('Folk Rock'), ('Folk Punk'), ('Americana'),
  ('Country'), ('Singer-Songwriter'),
  ('Punk'), ('Post-Punk'), ('Hardcore'), ('Emo'),
  ('Hip Hop'), ('R&B/Soul'),
  ('Jazz'), ('Blues'),
  ('Metal'),
  ('Electronic'), ('Trip Hop'), ('Downtempo'), ('Ambient'),
  ('Experimental'), ('Noise'), ('Drone'), ('Improv'),
  ('Ska'), ('World');
