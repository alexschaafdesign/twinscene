-- Photographers/videographers directory — a new entity alongside bands
-- (0009_create_bands_api.sql) and venues (0030_create_venues.sql). One table
-- with a `role` column rather than two separate tables, since photographers
-- and videographers overlap heavily and often are the same person.
--
-- Self-editing mirrors the bands claim->approve model exactly:
-- media_pro_editors is the authorization join table (checked by
-- canEditMediaPro in lib/auth.ts, mirroring canEditBand), and
-- media_pro_claims is the claim->approve flow (mirrors band_claims from
-- 0017_band_claims.sql, including the "one pending claim per user per row"
-- partial unique index). Unlike bands there's no separate ownership-code
-- path — an admin manually approving a claim in /admin/media-pro-claims is
-- the whole verification step.
create table media_pros (
  id             bigserial primary key,
  slug           text unique not null,
  name           text not null,
  role           text not null default 'photographer' check (role in ('photographer', 'videographer', 'both')),
  bio            text,
  city           text,
  website        text,
  instagram      text,
  contact        text,
  portfolio_url  text,
  photo          text,
  thumbnail_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table media_pro_editors (
  user_id       bigint not null references users(id) on delete cascade,
  media_pro_id  bigint not null references media_pros(id) on delete cascade,
  role          text not null default 'editor',
  created_at    timestamptz not null default now(),
  primary key (user_id, media_pro_id)
);

create index media_pro_editors_media_pro_id_idx on media_pro_editors (media_pro_id);

create table media_pro_claims (
  id            bigserial primary key,
  user_id       bigint not null references users(id) on delete cascade,
  media_pro_id  bigint not null references media_pros(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    bigint references users(id) on delete set null
);

create unique index media_pro_claims_one_pending_per_user_row
  on media_pro_claims (user_id, media_pro_id)
  where status = 'pending';
