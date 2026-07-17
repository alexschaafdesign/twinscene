-- Phase 2 of auth: band self-editing. Adds the claim->approve flow's table
-- and the index band_editors needs now that Phase 2 actually queries it by
-- band_id (Phase 1 only ever looked it up by (user_id, band_id), which the
-- primary key already covers).
--
-- Claim lifecycle: a logged-in user opens a 'pending' claim on a band; an
-- admin decides it, flipping status to 'approved' (band_editors row inserted
-- in the same transaction, see lib/bandClaims.ts) or 'rejected'. The partial
-- unique index below is what "rejects duplicates of an existing pending
-- claim" is enforced against — a user can have at most one open claim per
-- band, but can re-claim after a prior claim was rejected.

create table band_claims (
  id           bigserial primary key,
  user_id      bigint not null references users(id) on delete cascade,
  band_id      bigint not null references bands(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   bigint references users(id) on delete set null
);

create unique index band_claims_one_pending_per_user_band
  on band_claims (user_id, band_id)
  where status = 'pending';

-- Admin's "editors of this band" listing filters by band_id alone, which the
-- (user_id, band_id) primary key doesn't serve well.
create index band_editors_band_id_idx on band_editors (band_id);
