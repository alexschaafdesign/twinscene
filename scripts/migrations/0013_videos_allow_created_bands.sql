-- Extends the videos table (0012) to support "soft-creating" a band when a
-- parsed title matches nothing in the directory, instead of just logging it
-- to unmatched.json and dropping it. Mirrors the existing unreviewed-band
-- convention: lib/bands.ts's findOrCreateBandByName already creates
-- `unreviewed = true` bands for scrapers that can't match a lineup entry
-- (see 0009's comment on Birdhaus's write-capable client) — this reuses that
-- same function/flag rather than inventing a new mechanism.
--
-- `created` status: no existing band matched, so a new unreviewed band was
-- created and linked. match_score has no meaning for these rows (there was no
-- candidate to score against), hence dropping its NOT NULL rather than
-- storing a misleading 0.
alter table videos alter column match_score drop not null;

alter table videos drop constraint videos_status_check;
alter table videos add constraint videos_status_check
  check (status in ('auto', 'review', 'created'));
