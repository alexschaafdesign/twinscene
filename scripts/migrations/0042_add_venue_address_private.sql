-- Some DIY venues don't publicize a street address (you DM them for it). This
-- flag marks such venues: the profile shows "DM venue for address" instead of
-- an address, and no address is stored for them (the `address` column stays
-- null). Nullable-safe, additive, defaults false so existing venues are
-- unaffected. Shared DB (Crawlspace reads venues) — additive only.
alter table venues add column if not exists address_private boolean not null default false;
