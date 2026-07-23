-- Gear that may have a direct XLR/DI output (e.g. a bass amp) gets a per-item
-- flag the band can set, so the house engineer knows they can take a line
-- straight off the amp instead of needing a separate DI box.
--
-- Additive, defaults to false. The editor only surfaces the toggle for catalog
-- gear with an `xlrOut` config (see lib/stagePlotCatalog); the column is a
-- plain boolean.
alter table stage_plot_items add column xlr_out boolean not null default false;
