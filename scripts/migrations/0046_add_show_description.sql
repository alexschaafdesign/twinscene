-- Long-form event description/bio text, when a source provides one (e.g.
-- Dice's per-event description), plus a "for fans of" / "recommended if you
-- like" pull-quote split out of it (lib/scrapers/similarTo.ts) so it can be
-- surfaced as its own line on the show page rather than buried in a
-- paragraph. Both null for sources that don't carry this.
alter table shows add column if not exists description text;
alter table shows add column if not exists similar_to text;
