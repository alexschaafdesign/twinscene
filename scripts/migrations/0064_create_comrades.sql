-- Comrades directory — scene participants who aren't bands, musicians,
-- photo/video pros, or writers: recording studios, record labels, rehearsal
-- spaces, and the like. A near-exact clone of media_pros (0031/0032), same
-- self-editing model, but `category` replaces `role` and a short `tagline`
-- is added — unlike media_pros' uniform photographer/videographer roles,
-- comrades are heterogeneous, so the directory grid needs a line of preview
-- copy per entry rather than just a role chip.
create table comrades (
  id             bigserial primary key,
  slug           text unique not null,
  name           text not null,
  category       text not null default 'other' check (category in (
                   'recording_studio', 'record_label', 'rehearsal_space',
                   'sound_production', 'record_store', 'promoter_collective', 'other'
                 )),
  tagline        text,
  bio            text,
  city           text,
  website        text,
  instagram      text,
  contact        text,
  photo          text,
  thumbnail_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table comrade_editors (
  user_id     bigint not null references users(id) on delete cascade,
  comrade_id  bigint not null references comrades(id) on delete cascade,
  role        text not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (user_id, comrade_id)
);

create index comrade_editors_comrade_id_idx on comrade_editors (comrade_id);

create table comrade_claims (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  comrade_id  bigint not null references comrades(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint references users(id) on delete set null
);

create unique index comrade_claims_one_pending_per_user_row
  on comrade_claims (user_id, comrade_id)
  where status = 'pending';
