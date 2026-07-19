-- Replaces the blanket profile_public toggle's all-or-nothing behavior with
-- per-section control over what shows on /u/[username]. profile_public
-- (0020) still gates the whole page — these only matter once it's public.
-- All default true so existing public profiles keep showing everything they
-- do today; no action needed from existing users.
alter table users add column show_bio boolean not null default true;
alter table users add column show_status boolean not null default true;
alter table users add column show_followed_bands boolean not null default true;
alter table users add column show_attended_shows boolean not null default true;
