-- Structured show/doors times for the shows table.
--
-- Until now, scrapers parsed doors/music times into display strings and the
-- pipeline flattened them into the free-text `notes` blob (autoImport.ts's
-- composeNotes) — sortable by nothing, formatted only by convention. The
-- original `time text` column (0001) was never written or read and stays
-- orphaned (a later migration can drop it, same as the saved_bands orphan).
--
-- These two columns hold the real times as venue-local `time` values (no tz —
-- every venue is America/Chicago and these are wall-clock times), so shows can
-- be ordered within a day and rendered consistently. Both nullable: plenty of
-- listings give no time, and non-Tribe HTML scrapers often can't find one.
alter table shows add column music_time time;
alter table shows add column doors_time time;
