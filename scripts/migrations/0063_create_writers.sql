-- "Writers" — music writers / journalists / bloggers covering the local scene,
-- a new first-class identity alongside bands (0009), venues (0030), and media
-- pros (0031). This migration is two halves:
--
--   1. The IDENTITY (writers / writer_editors / writer_claims) — a near-exact
--      clone of the media_pros trio from 0031: a public directory row with the
--      bands-style claim->approve self-editing model. canEditWriter in
--      lib/auth.ts mirrors canEditMediaPro; writer_claims is approved by an
--      admin in /admin/writer-claims (no ownership-code path, same as media
--      pros). 'writer' also slots into the polymorphic follow + messaging
--      recipient types so a reader can follow a writer and message them.
--
--   2. The CONTENT (articles / article_entities) — the writing itself, entered
--      manually in v1 (admin curation). Each article links OUT to the original
--      (url) and carries a hand-picked, attributed pull_quote + embed/OG card
--      so a Reads page reads editorially, not as a list of links. article_
--      entities is the differentiator: it cross-links a piece to the bands /
--      shows / venues / musicians it's about, so "In the press" can surface on
--      those profiles.
--
-- NOTE on article_entities.entity_id being text: shows.id is uuid while
-- bands.id / venues.id / musicians.id are bigint (see docs/auth-and-db.md), so
-- a single polymorphic id column can't be a typed FK to all four. We store the
-- id as text and cast on read — the usual polymorphic-join tradeoff (no FK /
-- no cascade; app-level cleanup). entity_type is constrained so a typo can't
-- invent a new kind.

create table writers (
  id             bigserial primary key,
  slug           text unique not null,
  name           text not null,
  bio            text,
  city           text,
  publication    text,          -- outlet they mostly write for, e.g. "Racket", or their Substack name
  website        text,
  substack_url   text,          -- feed/homepage — the RSS auto-ingest seam for a later slice
  instagram      text,
  twitter        text,
  contact        text,
  photo          text,          -- headshot / avatar (full-size)
  thumbnail_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table writer_editors (
  user_id     bigint not null references users(id) on delete cascade,
  writer_id   bigint not null references writers(id) on delete cascade,
  role        text not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (user_id, writer_id)
);

create index writer_editors_writer_id_idx on writer_editors (writer_id);

create table writer_claims (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  writer_id   bigint not null references writers(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint references users(id) on delete set null
);

create unique index writer_claims_one_pending_per_user_row
  on writer_claims (user_id, writer_id)
  where status = 'pending';

-- The writing itself. url is the canonical link out (always shown / always
-- clickable). pull_quote is the hand-picked, attributed excerpt; embed_html is
-- a cached oEmbed card when the source offers one (Substack/YouTube/etc),
-- otherwise the app renders an OG card from hero_image_url + dek.
create table articles (
  id             bigserial primary key,
  writer_id      bigint not null references writers(id) on delete cascade,
  url            text not null,
  canonical_url  text,          -- normalized url for dedupe, if it differs from url
  title          text not null,
  publication    text,          -- where THIS piece ran (may differ from the writer's usual outlet)
  dek            text,          -- standfirst / summary line
  pull_quote     text,          -- hand-picked attributed excerpt (kept short — fair use)
  hero_image_url text,          -- og:image, fetched via lib/ogImage.ts
  embed_html     text,          -- cached oEmbed html when available
  published_at   timestamptz,   -- when the piece ran (nullable; not always known)
  reading_time   integer,       -- minutes (nullable)
  featured       boolean not null default false,
  status         text not null default 'published' check (status in ('draft', 'published')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index articles_writer_id_idx on articles (writer_id);
create index articles_published_at_idx on articles (published_at desc);
create index articles_featured_idx on articles (featured) where featured;

-- Polymorphic cross-link: which bands/shows/venues/musicians a piece is about.
-- See the NOTE at the top re: entity_id being text.
create table article_entities (
  id           bigserial primary key,
  article_id   bigint not null references articles(id) on delete cascade,
  entity_type  text not null check (entity_type in ('band', 'show', 'venue', 'musician')),
  entity_id    text not null,
  created_at   timestamptz not null default now()
);

create unique index article_entities_unique
  on article_entities (article_id, entity_type, entity_id);
create index article_entities_lookup_idx
  on article_entities (entity_type, entity_id);
