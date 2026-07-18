-- Musicians Slice 2: claim/link a musician to your account. Mirrors
-- band_claims (migration 0017) — a user requests a musician identity, an
-- admin approves, approval links `musicians.user_id` AND grants band_editors
-- for every band that musician is in (see lib/musicianClaims.ts).
create table musician_claims (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  musician_id bigint not null references musicians(id) on delete cascade,
  status      text not null default 'pending',   -- 'pending'|'approved'|'rejected'
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  bigint references users(id)
);

create unique index musician_claims_pending_uniq
  on musician_claims (user_id, musician_id) where status = 'pending';
