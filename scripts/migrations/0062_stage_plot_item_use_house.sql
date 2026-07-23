-- Backline gear a venue commonly provides (drum kit, bass/guitar amp) gets an
-- "will use the house one if provided" flag on the canvas item. Stored per item
-- so a plot can say "our own amp" for one and "house kit is fine" for another.
--
-- Additive, defaults to false so every existing item is unchanged. The editor
-- only surfaces the toggle for catalog gear with a houseLabel (see
-- lib/stagePlotCatalog); the column itself is a plain boolean.
alter table stage_plot_items add column use_house boolean not null default false;
