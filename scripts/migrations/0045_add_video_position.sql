-- Manual display order for a band's videos on their profile, set from the
-- "Videos" reorder controls in the edit form (components/SubmitForm.tsx).
-- Nullable, no default: a band that never touches the reorder controls keeps
-- every row null and the profile falls back to the pre-existing
-- published_date/created_at sort (lib/videos.ts) — this is purely additive,
-- opt-in ordering, not a replacement for the chronological default.
alter table videos add column if not exists position integer;
