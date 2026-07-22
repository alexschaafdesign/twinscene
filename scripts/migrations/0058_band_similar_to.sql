-- A band-filled "For fans of" / "sounds like" field: the references a band
-- wants to point new listeners at (other artists they resemble). This is the
-- band-authored counterpart to shows.similar_to (0046), which is scraper-
-- derived per-show pull-quotes — this one lives on the band and the band edits
-- it through the submit/correct form, grouped with genres as their "vibe".
--
-- Stored comma-joined (like `genre`), split into chips on read (lib/fetchBands
-- similarTo) and for the tag input. Null for bands that haven't filled it in.
alter table bands add column if not exists similar_to text;
