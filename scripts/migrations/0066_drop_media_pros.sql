-- Drop the retired Photo/Video directory tables. Photographers/videographers
-- were folded into the comrades directory as a `photo_video` category by
-- migration 0065, which copied every media_pros row (+ its editors + claims)
-- into the comrades tables. Nothing reads media_pros / media_pro_editors /
-- media_pro_claims anymore — the entire media-pro code island (lib, routes,
-- components, canEditMediaPro) was deleted alongside this migration.
--
-- Deliberately a SEPARATE migration from the 0065 data copy, per the
-- saved_bands/0028 pattern: dropping a table in the same migration that ships
-- the code removing its last reader means a rollback lands on a missing table.
-- By the time this runs, 0065 + the code deletion are already live.
--
-- The runner (scripts/migrate.mjs) wraps this in a transaction; no BEGIN/COMMIT.

-- Child tables first (both FK-reference media_pros). `if exists` keeps this
-- safe to run even if a prior attempt already dropped them.
drop table if exists media_pro_claims;
drop table if exists media_pro_editors;
drop table if exists media_pros;
