-- Adds last-activity tracking to users so the admin users view can show a
-- meaningful "last seen" instead of only account-creation time. sessions.created_at
-- records when a *fresh* session was minted, but the 90-day sliding renewal
-- (lib/auth.ts getCurrentUser) pushes expires_at forward without touching
-- created_at, so it undercounts active returning users. This column is stamped
-- on a throttled cadence (at most ~once/hour per user) from getCurrentUser.
--
-- Nullable with no default: existing rows read as "never seen since this
-- shipped" until their owner's next authenticated request backfills it.
alter table users add column last_seen_at timestamptz;
