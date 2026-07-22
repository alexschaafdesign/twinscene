// Raw-SQL data layer for stage plots (migration 0060). Three tables:
// stage_plots (one per named plot) + its stage_plot_items (canvas icons) and
// input_list_items (numbered channel list), both cascade-deleted with the plot.
//
// AUTHORIZATION IS NOT DONE HERE. Every mutation is gated by canEditBand at the
// route/action layer (look up a plot's band_id via getPlotBandId, then check).
// This module only reads/writes rows and normalizes untrusted payloads.

import { sql } from "./db.ts";
import { isCatalogKey } from "./stagePlotCatalog.ts";

// Width-to-height ratio of the stage canvas, shared by the web editor and the
// PDF so a plot renders identically in both. Wider than tall, like a stage seen
// from the audience.
export const STAGE_CANVAS_ASPECT = 3 / 2;

export interface StagePlot {
  id: number;
  band_id: number;
  name: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface StagePlotItem {
  id: number;
  item_type: string;
  label: string | null;
  x: number; // 0..1 fraction of canvas width
  y: number; // 0..1 fraction of canvas height
  rotation: number;
  notes: string | null;
  position: number;
}

export interface InputListItem {
  id: number;
  channel_number: number | null;
  source: string;
  mic_or_di: string | null;
  stand: string | null;
  phantom_power: boolean;
  notes: string | null;
  position: number;
}

export interface StagePlotDetail {
  plot: StagePlot;
  items: StagePlotItem[];
  inputs: InputListItem[];
}

// Field limits — small lists shown on one page and printed to one PDF, so cap
// generously but finitely. A hostile payload can't blow up the DB or the PDF.
const MAX_ITEMS = 200;
const MAX_INPUTS = 200;
const MAX_NAME = 120;
const MAX_TEXT = 500;

export interface StagePlotSummary extends StagePlot {
  item_count: number;
  input_count: number;
}

/** A band's plots, most-recently-updated first, with child counts for the list
 *  page. */
export async function listPlots(bandId: number): Promise<StagePlotSummary[]> {
  return sql<StagePlotSummary[]>`
    select
      sp.id, sp.band_id, sp.name, sp.created_by,
      sp.created_at, sp.updated_at,
      (select count(*) from stage_plot_items i where i.stage_plot_id = sp.id)::int as item_count,
      (select count(*) from input_list_items l where l.stage_plot_id = sp.id)::int as input_count
    from stage_plots sp
    where sp.band_id = ${bandId}
    order by sp.updated_at desc, sp.id desc
  `;
}

/** Just the owning band for an authorization check — null if the plot is gone. */
export async function getPlotBandId(plotId: number): Promise<number | null> {
  const [row] = await sql<{ band_id: number }[]>`
    select band_id from stage_plots where id = ${plotId} limit 1
  `;
  return row?.band_id ?? null;
}

export async function getPlot(plotId: number): Promise<StagePlot | null> {
  const [row] = await sql<StagePlot[]>`
    select id, band_id, name, created_by, created_at, updated_at
    from stage_plots where id = ${plotId} limit 1
  `;
  return row ?? null;
}

/** Plot plus both child lists, ordered for rendering. numeric x/y come back as
 *  float8 (JS numbers) rather than postgres.js's default string-for-numeric. */
export async function getPlotDetail(plotId: number): Promise<StagePlotDetail | null> {
  const plot = await getPlot(plotId);
  if (!plot) return null;

  const items = await sql<StagePlotItem[]>`
    select id, item_type, label, x::float8 as x, y::float8 as y,
           rotation, notes, position
    from stage_plot_items
    where stage_plot_id = ${plotId}
    order by position asc, id asc
  `;
  const inputs = await sql<InputListItem[]>`
    select id, channel_number, source, mic_or_di, stand,
           phantom_power, notes, position
    from input_list_items
    where stage_plot_id = ${plotId}
    order by position asc, id asc
  `;
  return { plot, items: [...items], inputs: [...inputs] };
}

export async function createPlot(
  bandId: number,
  createdBy: number,
  name: string,
): Promise<number> {
  const clean = name.trim().slice(0, MAX_NAME) || "Stage Plot";
  const [row] = await sql<{ id: number }[]>`
    insert into stage_plots (band_id, name, created_by)
    values (${bandId}, ${clean}, ${createdBy})
    returning id
  `;
  return row.id;
}

export async function deletePlot(plotId: number): Promise<void> {
  await sql`delete from stage_plots where id = ${plotId}`;
}

// --- Autosave payload normalization --------------------------------------

export interface NormalizedContent {
  name: string;
  items: {
    item_type: string;
    label: string | null;
    x: number;
    y: number;
    rotation: number;
    notes: string | null;
    position: number;
  }[];
  inputs: {
    channel_number: number | null;
    source: string;
    mic_or_di: string | null;
    stand: string | null;
    phantom_power: boolean;
    notes: string | null;
    position: number;
  }[];
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function intOrNull(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Turn an untrusted autosave body into rows safe to persist. Unknown item_type
 * keys are dropped (they'd never render), coordinates clamp to 0..1, strings
 * trim + cap, and both lists cap in length. Positions are reassigned from array
 * order so the stored order is exactly what the client showed.
 */
export function normalizeContent(raw: unknown): NormalizedContent {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = (str(body.name, MAX_NAME) ?? "Stage Plot");

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const items: NormalizedContent["items"] = [];
  rawItems.forEach((raw, i) => {
    const it = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!isCatalogKey(it.item_type)) return; // drop unknown gear
    items.push({
      item_type: it.item_type,
      label: str(it.label, MAX_TEXT),
      x: clamp01(it.x),
      y: clamp01(it.y),
      rotation: intOrNull(it.rotation, 0, 359) ?? 0,
      notes: str(it.notes, MAX_TEXT),
      position: i,
    });
  });

  const rawInputs = Array.isArray(body.inputs) ? body.inputs.slice(0, MAX_INPUTS) : [];
  const inputs: NormalizedContent["inputs"] = rawInputs.map((raw, i) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      channel_number: intOrNull(row.channel_number, 0, 9999),
      source: str(row.source, MAX_TEXT) ?? "",
      mic_or_di: str(row.mic_or_di, MAX_TEXT),
      stand: str(row.stand, MAX_TEXT),
      phantom_power: row.phantom_power === true,
      notes: str(row.notes, MAX_TEXT),
      position: i,
    };
  });

  return { name, items, inputs };
}

/**
 * Persist an autosave: update the name and replace both child lists wholesale
 * inside one transaction. Replace-not-diff keeps the save trivial and matches
 * the layout editor's last-write-wins model — fine for a single-editor tool.
 * Stamps updated_at so the list page's ordering reflects the edit.
 */
export async function saveContent(plotId: number, content: NormalizedContent): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update stage_plots set name = ${content.name}, updated_at = now()
      where id = ${plotId}
    `;
    await tx`delete from stage_plot_items where stage_plot_id = ${plotId}`;
    await tx`delete from input_list_items where stage_plot_id = ${plotId}`;

    if (content.items.length) {
      await tx`
        insert into stage_plot_items ${tx(
          content.items.map((it) => ({ stage_plot_id: plotId, ...it })),
          "stage_plot_id",
          "item_type",
          "label",
          "x",
          "y",
          "rotation",
          "notes",
          "position",
        )}
      `;
    }
    if (content.inputs.length) {
      await tx`
        insert into input_list_items ${tx(
          content.inputs.map((row) => ({ stage_plot_id: plotId, ...row })),
          "stage_plot_id",
          "channel_number",
          "source",
          "mic_or_di",
          "stand",
          "phantom_power",
          "notes",
          "position",
        )}
      `;
    }
  });
}
