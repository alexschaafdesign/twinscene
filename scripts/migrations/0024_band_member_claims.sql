-- Band ownership Slice B: membership claims become BAND-scoped ("I'm <musician>
-- in <band>"), approved by that band's OWNER (band_editors role='owner', see
-- lib/bandOwnership.ts) with admin as fallback for ownerless bands — instead of
-- Slice 2's musician_claims, which linked a user to a musician identity and
-- granted band_editors for *every* band that musician happened to be in,
-- reviewed only by an admin. musician_claims has no real prod data yet, so it's
-- dropped outright rather than migrated in place; see lib/bandMemberClaims.ts.
drop table musician_claims;

create table band_member_claims (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  band_id     bigint not null references bands(id) on delete cascade,
  musician_id bigint not null references musicians(id) on delete cascade,
  status      text not null default 'pending',   -- 'pending'|'approved'|'rejected'
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint references users(id)
);

-- One open claim per (user, band, musician) triple — a user can still have
-- multiple *different* pending claims (e.g. requesting to join two bands)
-- before any is decided.
create unique index band_member_claims_pending_uniq
  on band_member_claims (user_id, band_id, musician_id) where status = 'pending';

create index band_member_claims_band_idx on band_member_claims (band_id);
