// Monochrome, technical stage-plot symbols — the kind a house engineer reads at
// a glance (mic on a stand, speaker cabinets, a floor wedge, DI/power boxes).
// Line style matches the app's Tabler-ish icons: a 24×24 viewBox, currentColor
// stroke, round caps. Solid bits (knobs, black keys, the power bolt) fill with
// currentColor. Keyed off the catalog `item_type`; unknown keys fall back to a
// plain box so an old plot still draws.

import type { CSSProperties } from "react";

// Natural on-canvas size per type, in px — a drum kit reads bigger than a mic.
// The canvas is responsive but gear is drawn at fixed px, like a real plot where
// a monitor is a monitor regardless of paper size.
export const SYMBOL_SIZE: Record<string, number> = {
  vocal_mic: 30,
  guitar_amp: 40,
  bass_amp: 40,
  acoustic_guitar: 42,
  drum_kit: 60,
  keys: 52,
  horn: 44,
  di_box: 30,
  monitor: 48,
  power: 32,
  other: 34,
};

export function symbolSize(type: string): number {
  return SYMBOL_SIZE[type] ?? 36;
}

// Keep the rendered stroke roughly constant across symbol sizes. The 24-unit
// viewBox scales strokes with the symbol, so without this a big symbol (drum
// kit at 60px) draws a ~4px stroke while a mic at 30px sits near ~2px, making
// the big ones look chunky. Solve strokeWidth so the on-screen stroke lands on
// a target regardless of size.
const STROKE_PX = 2.3;
export const strokeWidthFor = (size: number) => (STROKE_PX * 24) / size;

function paths(type: string) {
  switch (type) {
    case "vocal_mic":
      return (
        <>
          <circle cx="12" cy="8" r="4.2" />
          <path d="M12 12.2V18" />
          <path d="M8.5 18h7" />
        </>
      );
    case "guitar_amp":
      return (
        <>
          <rect x="4" y="3.5" width="16" height="17" rx="1.6" />
          <path d="M4 8h16" />
          <circle cx="7.5" cy="5.8" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="5.8" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14.5" r="3.9" />
          <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case "bass_amp":
      return (
        <>
          <rect x="4" y="3.5" width="16" height="17" rx="1.6" />
          <circle cx="12" cy="11.5" r="5.6" />
          <circle cx="12" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18.4" r="0.9" fill="currentColor" stroke="none" />
        </>
      );
    case "acoustic_guitar":
      return (
        <>
          <circle cx="9" cy="15" r="5" />
          <circle cx="9" cy="15" r="1.6" />
          <path d="M12.4 11.6L19 5" />
          <path d="M17.6 3.8l2.6 2.6" />
        </>
      );
    case "drum_kit":
      return (
        <>
          <circle cx="12" cy="14.5" r="4.4" />
          <circle cx="6.4" cy="8.4" r="2.6" />
          <circle cx="17.6" cy="8.4" r="2.6" />
          <circle cx="9.4" cy="10.6" r="2" />
          <circle cx="14.6" cy="10.6" r="2" />
          <circle cx="5.6" cy="15.4" r="2.1" />
        </>
      );
    case "keys":
      return (
        <>
          <rect x="3" y="8" width="18" height="9" rx="1" />
          <path d="M7 8v9M11 8v9M15 8v9" />
          <rect x="5.9" y="8" width="2.2" height="5" rx="0.4" fill="currentColor" stroke="none" />
          <rect x="9.9" y="8" width="2.2" height="5" rx="0.4" fill="currentColor" stroke="none" />
          <rect x="13.9" y="8" width="2.2" height="5" rx="0.4" fill="currentColor" stroke="none" />
        </>
      );
    case "horn":
      return (
        <>
          <path d="M5 12h11" />
          <path d="M16 8.5l4 -1.6v10.2l-4 -1.6z" />
          <circle cx="4" cy="12" r="1.1" />
          <path d="M9 12V9M11.5 12V9M14 12V9" />
        </>
      );
    case "di_box":
      return (
        <>
          <rect x="5" y="9" width="14" height="8" rx="1.2" />
          <path d="M12 9V5.6" />
          <circle cx="12" cy="4.4" r="1.3" />
          <circle cx="8" cy="13" r="0.8" fill="currentColor" stroke="none" />
          <path d="M13.5 13h2.5" />
        </>
      );
    case "monitor":
      return (
        <>
          <path d="M5 17l2 -7h10l2 7z" />
          <circle cx="12" cy="13.4" r="2.7" />
          <circle cx="12" cy="13.4" r="0.7" fill="currentColor" stroke="none" />
        </>
      );
    case "power":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2.4" />
          <path
            d="M12.6 6.6L8.6 12.4H11.4L10.4 17.4L15 11.4H12.2L12.6 6.6Z"
            fill="currentColor"
            stroke="none"
          />
        </>
      );
    default: // "other" and any unknown key
      return (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="2.6" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </>
      );
  }
}

export default function StageSymbol({
  type,
  size = 36,
  style,
}: {
  type: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidthFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {paths(type)}
    </svg>
  );
}
