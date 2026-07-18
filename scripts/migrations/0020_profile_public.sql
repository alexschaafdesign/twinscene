-- Phase 3 slice C (frontend): per-user privacy toggle for public profiles
-- (/u/[username]). Additive, defaults to public so existing users need no
-- action to keep their current (already-public-by-default) behavior.

alter table users add column profile_public boolean not null default true;
