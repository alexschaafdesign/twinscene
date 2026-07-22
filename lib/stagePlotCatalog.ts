// The fixed vocabulary of things a band can drop onto a stage plot canvas.
//
// This is code, not data: it's edited here in the repo, never by users. Each
// entry has a `key` (stored as stage_plot_items.item_type), a `label`, and the
// input-list rows to seed when it's dropped — dropping "Vocal Mic" auto-adds a
// "Lead Vocal" channel, which the band then edits freely. A dropped item and
// its seeded rows are NOT locked together after creation (lib/stagePlots.ts
// replaces both lists wholesale on save), so a band can add a channel with no
// icon ("Talkback") or an icon with no channel.
//
// The visual for each key is a monochrome stage-plot symbol drawn in
// components/StageSymbol.tsx (and mirrored into the PDF in lib/stagePlotPdf.tsx),
// keyed off `key` — so there's no icon field here.
//
// The input list is deliberately just the source (+ optional notes): mic/DI
// choice, stand type and phantom power are the house engineer's call, not the
// band's, so we don't collect them.
//
// `stage_plot_items.item_type` stores the `key`; an unknown key (e.g. a catalog
// entry removed later) falls back to OTHER_ITEM so an old plot still renders.

export interface DefaultInput {
  source: string;
}

export interface CatalogItem {
  key: string;
  label: string;
  /** Channel rows auto-created when this item is dropped. Empty for gear that
   *  isn't a channel source (monitors, power drops). */
  defaultInputs: DefaultInput[];
}

export const STAGE_PLOT_CATALOG: CatalogItem[] = [
  {
    key: "vocal_mic",
    label: "Vocal Mic",
    defaultInputs: [{ source: "Lead Vocal" }],
  },
  {
    key: "guitar_amp",
    label: "Guitar Amp",
    defaultInputs: [{ source: "Guitar Amp" }],
  },
  {
    key: "bass_amp",
    label: "Bass Amp",
    defaultInputs: [{ source: "Bass" }],
  },
  {
    key: "acoustic_guitar",
    label: "Acoustic Guitar",
    defaultInputs: [{ source: "Acoustic Guitar" }],
  },
  {
    key: "drum_kit",
    label: "Drum Kit",
    // Just one "Drum Kit" line — venues know how to mic a kit, and there's
    // often a house kit anyway. The band can break it into per-drum channels
    // by hand if they want.
    defaultInputs: [{ source: "Drum Kit" }],
  },
  {
    key: "keys",
    label: "Keyboard / Keys",
    defaultInputs: [{ source: "Keys L" }, { source: "Keys R" }],
  },
  {
    key: "horn",
    label: "Horn / Wind",
    defaultInputs: [{ source: "Horn" }],
  },
  {
    key: "di_box",
    label: "DI Box",
    defaultInputs: [{ source: "DI" }],
  },
  {
    key: "monitor",
    label: "Monitor Wedge",
    defaultInputs: [],
  },
  {
    key: "power",
    label: "Power Drop",
    defaultInputs: [],
  },
  {
    key: "other",
    label: "Other",
    defaultInputs: [{ source: "Other" }],
  },
];

export const OTHER_ITEM: CatalogItem =
  STAGE_PLOT_CATALOG.find((c) => c.key === "other") ?? STAGE_PLOT_CATALOG[0];

const BY_KEY = new Map(STAGE_PLOT_CATALOG.map((c) => [c.key, c]));

/** Catalog entry for a stored item_type. Unknown keys fall back to OTHER_ITEM
 *  so a plot saved against a since-removed key still renders. */
export function catalogItem(key: string): CatalogItem {
  return BY_KEY.get(key) ?? OTHER_ITEM;
}

export function isCatalogKey(key: unknown): key is string {
  return typeof key === "string" && BY_KEY.has(key);
}
