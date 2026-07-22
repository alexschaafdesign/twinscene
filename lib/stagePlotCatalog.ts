// The fixed vocabulary of things a band can drop onto a stage plot canvas.
//
// This is code, not data: it's edited here in the repo, never by users. Each
// entry knows how to render itself (an emoji `icon` for the web palette/canvas)
// and what input-list rows to seed when it's dropped — dropping "Vocal Mic"
// auto-adds a channel row (Lead Vocal / SM58), which the band then edits freely.
// A dropped item and its seeded rows are NOT locked together after creation
// (lib/stagePlots.ts replaces both lists wholesale on save), so a band can add
// a channel with no icon ("Talkback") or an icon with no channel.
//
// `stage_plot_items.item_type` stores the `key`; an unknown key (e.g. a catalog
// entry removed later) falls back to OTHER_ITEM so an old plot still renders.

export interface DefaultInput {
  source: string;
  micOrDi?: string;
  stand?: string;
  phantomPower?: boolean;
}

export interface CatalogItem {
  key: string;
  label: string;
  /** Emoji shown in the palette and on the canvas. PDF export uses `label`
   *  instead — react-pdf's default fonts don't render color emoji. */
  icon: string;
  /** Channel rows auto-created when this item is dropped. Empty for gear that
   *  isn't a channel source (monitors, power drops). */
  defaultInputs: DefaultInput[];
}

export const STAGE_PLOT_CATALOG: CatalogItem[] = [
  {
    key: "vocal_mic",
    label: "Vocal Mic",
    icon: "🎤",
    defaultInputs: [{ source: "Lead Vocal", micOrDi: "SM58", stand: "Tall boom" }],
  },
  {
    key: "guitar_amp",
    label: "Guitar Amp",
    icon: "🔊",
    defaultInputs: [{ source: "Guitar Amp", micOrDi: "SM57", stand: "Short boom" }],
  },
  {
    key: "bass_amp",
    label: "Bass Amp",
    icon: "🎚️",
    defaultInputs: [{ source: "Bass", micOrDi: "DI" }],
  },
  {
    key: "acoustic_guitar",
    label: "Acoustic Guitar",
    icon: "🎸",
    defaultInputs: [{ source: "Acoustic Guitar", micOrDi: "DI" }],
  },
  {
    key: "drum_kit",
    label: "Drum Kit",
    icon: "🥁",
    // One canvas icon, several channels — the common minimum a house engineer
    // expects. Split into separate icons only if a band actually asks.
    defaultInputs: [
      { source: "Kick", micOrDi: "D112", stand: "Short boom" },
      { source: "Snare", micOrDi: "SM57", stand: "Short boom" },
      { source: "Hi-Hat", micOrDi: "Condenser", stand: "Tall boom", phantomPower: true },
      { source: "Overhead L", micOrDi: "Condenser", stand: "Tall boom", phantomPower: true },
      { source: "Overhead R", micOrDi: "Condenser", stand: "Tall boom", phantomPower: true },
    ],
  },
  {
    key: "keys",
    label: "Keyboard / Keys",
    icon: "🎹",
    defaultInputs: [
      { source: "Keys L", micOrDi: "DI" },
      { source: "Keys R", micOrDi: "DI" },
    ],
  },
  {
    key: "horn",
    label: "Horn / Wind",
    icon: "🎺",
    defaultInputs: [{ source: "Horn", micOrDi: "SM57", stand: "Tall boom" }],
  },
  {
    key: "di_box",
    label: "DI Box",
    icon: "🔌",
    defaultInputs: [{ source: "DI", micOrDi: "DI" }],
  },
  {
    key: "monitor",
    label: "Monitor Wedge",
    icon: "📢",
    defaultInputs: [],
  },
  {
    key: "power",
    label: "Power Drop",
    icon: "⚡",
    defaultInputs: [],
  },
  {
    key: "other",
    label: "Other",
    icon: "⬜",
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
