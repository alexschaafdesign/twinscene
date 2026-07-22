-- Stage-plot canvas items become resizable. Adds a per-item `scale` multiplier
-- applied to the symbol's natural size (SYMBOL_SIZE in components/StageSymbol),
-- so a band can size a drum riser bigger than a DI box on the same canvas.
--
-- Additive, defaults to 1 so every existing item renders unchanged. The editor
-- clamps to 0.5..2.5; the column itself just stores a numeric. Rotation was
-- already stored (0060) — this closes the gap so both transforms persist.
alter table stage_plot_items add column scale numeric not null default 1;
