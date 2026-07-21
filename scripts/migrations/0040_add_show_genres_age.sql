-- Genre + age-restriction facets for shows.
--
-- Both are best-effort *suggestions*, not authoritative: genres come either
-- from a venue that categorizes its own events (The Dakota's API categories)
-- or from Crawl Space's daily complete-list annotations matched onto shows we
-- already have (see lib/scrapers/reconcile.ts). An admin editing a show can
-- override either, and an edited_at-locked row stops taking scraped values.
--
-- genres is jsonb to match the shows table's other list columns (lineup,
-- starred_by, review_reasons); age_restriction is free-ish text ("21+",
-- "18+", "All Ages") since venues phrase it inconsistently.
alter table shows add column genres jsonb not null default '[]';
alter table shows add column age_restriction text;
