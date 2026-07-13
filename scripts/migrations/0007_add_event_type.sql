-- Event-type label for listings that aren't a normal band bill (e.g. "Private
-- Event", "Record Sale", "Meetup"). Set by scrapers that import all of a
-- venue's events rather than dropping the non-shows (see hookandladder.ts);
-- NULL means an ordinary music show. Rendered as a chip on the public shows
-- timeline and in Import Review, so it's a first-class column rather than
-- buried in the raw jsonb lineage blob (mirrors notes/flyer_url in 0003).
ALTER TABLE shows ADD COLUMN event_type text;
