-- Phase 3 slice 2 (frontend): profile identity fields. Nullable/additive —
-- existing users (created via magic-link login, which only ever sets email)
-- have no username or bio until they visit /profile/edit. image_url and
-- name already exist from 0016 (users auth table), so this only adds the two
-- new fields plus the uniqueness constraint /u/[username] (slice C) depends on.
--
-- Case-insensitive uniqueness via a functional index on lower(username),
-- rather than a plain unique constraint on username, so "Alex" and "alex"
-- can't both be claimed — the app stores the user's chosen casing but
-- checks/enforces uniqueness case-insensitively.

alter table users add column username text;
alter table users add column bio text;

create unique index users_username_lower_key on users (lower(username));
