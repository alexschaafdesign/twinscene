-- Stage plots: a per-band, authenticated-only tool for building a stage
-- diagram + numbered input list and exporting it as a PDF to send to venues.
--
-- A band can have several plots ("Full Band", "Acoustic Duo", "Winter Tour").
-- Gated by canEditBand at the route/action layer, same as every other
-- band-editor surface; there is NO public/share route and deliberately no
-- share_token — the PDF export covers the actual need.
--
-- Two child lists hang off a plot, each deleted with it (on delete cascade):
--   stage_plot_items  — icons placed on the canvas (resolution-independent
--                       0..1 fractional coordinates, so a plot renders the same
--                       at any canvas/PDF size).
--   input_list_items  — the numbered channel list. Seeded from a dropped
--                       canvas item's catalog defaults, but NOT rigidly locked
--                       to the canvas after that: a row can exist with no canvas
--                       item (e.g. "Talkback") and vice versa.
--
-- Additive, matches the existing style: bigint identity PKs, FKs to bands/users.
create table stage_plots (
  id bigint generated always as identity primary key,
  band_id bigint not null references bands(id) on delete cascade,
  name text not null default 'Stage Plot',
  created_by bigint references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on stage_plots (band_id);

create table stage_plot_items (
  id bigint generated always as identity primary key,
  stage_plot_id bigint not null references stage_plots(id) on delete cascade,
  item_type text not null,       -- fixed catalog key, e.g. 'vocal_mic', 'guitar_amp', 'drum_kit'
  label text,                    -- optional custom label, e.g. "12-string acoustic w/ pickup"
  x numeric not null,            -- 0..1 fraction of canvas width (resolution-independent)
  y numeric not null,            -- 0..1 fraction of canvas height
  rotation int not null default 0,
  notes text,
  position int not null default 0
);
create index on stage_plot_items (stage_plot_id);

create table input_list_items (
  id bigint generated always as identity primary key,
  stage_plot_id bigint not null references stage_plots(id) on delete cascade,
  channel_number int,
  source text not null,          -- e.g. "Lead Vocal", "Kick In"
  mic_or_di text,                -- e.g. "SM58", "DI"
  stand text,                    -- e.g. "Tall boom", "Short boom", "None"
  phantom_power boolean not null default false,
  notes text,
  position int not null default 0
);
create index on input_list_items (stage_plot_id);
