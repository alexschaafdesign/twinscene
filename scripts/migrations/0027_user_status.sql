-- Old-Facebook-style status: "[name] is ... [status]". A single short line a
-- user sets from their own profile, shown on /profile and (for public
-- profiles) /u/[username]. Additive and nullable — existing users simply have
-- no status until they set one.
--
-- status_at records when it was last set, so the UI can show "2 hours ago"
-- and a stale status reads as stale rather than as current. Cleared together
-- with status (both go null) when a user empties the box.

alter table users add column status text;
alter table users add column status_at timestamptz;
