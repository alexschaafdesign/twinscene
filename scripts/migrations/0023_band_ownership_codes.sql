-- Band ownership via redemption codes: an admin verifies a band's Instagram
-- out-of-band, generates a one-time code, DMs it to them, and they redeem it
-- here to become the band's owner — an elevated band_editors role (existing
-- column, no schema change needed there). Mirrors login_tokens: only the
-- HASH of the code is ever stored; the plaintext exists only in the admin's
-- one-time generate response and the DM they send.

create table band_ownership_codes (
  id          bigint generated always as identity primary key,
  band_id     bigint not null references bands(id) on delete cascade,
  code_hash   text not null,                 -- store a HASH of the code, never the raw value
  created_by  bigint not null references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,          -- e.g. now() + 30 days
  redeemed_by bigint references users(id),
  redeemed_at timestamptz
);

create index band_ownership_codes_band_idx on band_ownership_codes (band_id);
