-- Some venues (e.g. Badgers Den — sometimes DIY, sometimes an independent
-- booking) can't be auto-scraped and must be entered by hand. This flag marks
-- them so the admin scraper panel can group them into a "Manual scrape
-- required" reminder section. Additive, defaults false. Shared DB (Crawlspace
-- reads venues) — additive only.
alter table venues add column if not exists manual_scrape boolean not null default false;
