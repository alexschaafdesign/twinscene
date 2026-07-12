-- Shows table: general-purpose across every venue in town. "source" is just
-- the scraper id (or "manual") that produced a row — no venue/source is
-- special-cased in the schema.
--
-- lineup is jsonb, not text[]: each entry is { name, bandSlug }, where
-- bandSlug links against Birdhaus's band directory once resolved. The
-- initial backfill sets bandSlug to null for every entry; matching against
-- the directory is a separate follow-up phase.
CREATE TABLE shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_key text NOT NULL UNIQUE,
  venue_name text NOT NULL,
  title text NOT NULL,
  date date NOT NULL,
  time text,
  ticket_url text,
  lineup jsonb NOT NULL DEFAULT '[]',
  starred boolean DEFAULT false,
  edited_at timestamptz,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_shows_date ON shows(date);
CREATE INDEX idx_shows_source ON shows(source);
