-- Tombstones a scraped show's source_key when an admin rejects it in
-- /admin/review (deleteShow). upsertScrapedShow checks this table and
-- refuses to resurrect a rejected source_key on the next scrape run, the
-- same way an edited_at-locked row already refuses to be overwritten.
-- deleteShow still hard-deletes the shows row itself — nothing else reading
-- the shared `shows` table (including Crawlspace) needs to change.
create table if not exists rejected_show_sources (
  source_key text primary key,
  rejected_at timestamptz not null default now(),
  actor text not null
);
