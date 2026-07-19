-- Portfolio gallery for photo/video listings (0031_create_media_pros.sql) —
-- up to 5 high-quality work samples, distinct from the single profile
-- `photo`. A plain text[] rather than a join table: the submit form always
-- writes the whole gallery back on save (mirrors how `photo` is handled),
-- so there's no need for per-row metadata or independent inserts.
alter table media_pros add column gallery text[] not null default '{}';

alter table media_pros add constraint media_pros_gallery_max_5
  check (array_length(gallery, 1) is null or array_length(gallery, 1) <= 5);
