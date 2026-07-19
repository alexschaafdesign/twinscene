-- Guided onboarding ("Who are you?"): photographer and venue owner/employee
-- are roles a user can self-declare during onboarding, but neither has a
-- backing table yet (planned for later). This captures the interest signal
-- so there's a list to notify/backfill once those features ship, without
-- pretending the roles exist yet. See lib/onboardingInterest.ts.

create table onboarding_interest (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  role       text not null,  -- 'photographer' | 'venue'
  created_at timestamptz not null default now()
);

-- Revisiting onboarding and re-clicking "notify me" shouldn't create a
-- second row for the same person/role.
create unique index onboarding_interest_user_role_uniq
  on onboarding_interest (user_id, role);
