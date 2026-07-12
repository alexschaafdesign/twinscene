-- Per-outlet star attribution for the Press-outlet star feature (lib/press.ts,
-- ShowsTimeline): multiple outlets can independently star the same show, each
-- with their own blurb/post URL. `starred` boolean stays as a cheap derived
-- flag (true whenever starred_by is non-empty) for existing filter/index use.
ALTER TABLE shows ADD COLUMN starred_by jsonb NOT NULL DEFAULT '[]';
