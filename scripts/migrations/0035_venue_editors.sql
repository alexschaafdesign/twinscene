-- Venue self-editing — mirrors media_pro_editors/media_pro_claims from
-- 0031_create_media_pros.sql exactly. venues (0030_create_venues.sql) had no
-- editor/ownership model at all until now: canEditVenue in lib/auth.ts is the
-- new authorization rule, and venue_claims is the claim->approve flow an
-- admin decides at /admin/venue-claims. Simpler than bands' Instagram-DM
-- ownership-code flow — appropriate since venues don't carry the same
-- impersonation stakes as a band identity, same reasoning as media pros.
create table venue_editors (
  user_id     bigint not null references users(id) on delete cascade,
  venue_id    bigint not null references venues(id) on delete cascade,
  role        text not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create index venue_editors_venue_id_idx on venue_editors (venue_id);

create table venue_claims (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  venue_id    bigint not null references venues(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint references users(id) on delete set null
);

create unique index venue_claims_one_pending_per_user_row
  on venue_claims (user_id, venue_id)
  where status = 'pending';
