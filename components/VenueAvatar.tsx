// Shared avatar treatment for venue grid/list cards: one textured background
// image, hue-shifted per venue, with manually-set (or auto-derived) initials
// overlaid on top. Replaces the old per-venue mix of logo / photo / gray-box
// initials on cards — see components/venue-shared-client.tsx's VenueImage for
// the photo-based treatment this doesn't touch (venue detail page still uses
// it).
//
// The texture and the initials are separate layers: the hue-rotate filter
// below applies only to the background image, never to the text, since a
// filter on the text would distort its color/contrast along with the hue.

import type { CSSProperties } from "react";
import { hueForSlug } from "@/lib/venueColor";

const TEXTURE_SRC = "/venues/avatar-texture.png";

// Most venues set 2-3 letter initials, but some (e.g. "Caydence") want the
// whole word to fit instead. Shrink the font as the label gets longer, and
// let it wrap onto a second line, rather than assuming a fixed-width
// initials tile. Expressed as a fraction of the tile's own width (via a CSS
// container query unit — see `containerType` below) rather than a px value,
// so this scales correctly whether `size` is a fixed pixel tile (the dev
// preview) or a fluid grid card that only knows its size at layout time.
function fontSizeFor(label: string): string {
  const len = label.length;
  if (len <= 3) return "32cqw";
  if (len <= 5) return "22cqw";
  if (len <= 8) return "15cqw";
  return "12cqw";
}

export default function VenueAvatar({
  slug,
  initials,
  size,
  fill = false,
  className = "",
}: {
  slug: string;
  initials: string;
  /** Fixed pixel size, e.g. for the dev preview grid. Omit to fill the
   * parent (`w-full aspect-square`) for use in a responsive grid card. */
  size?: number;
  /** Fill the parent in BOTH dimensions (`h-full w-full`, no forced square) —
   * for a stretched, full-height column rather than a square tile. Overrides
   * the default aspect-square sizing; ignored when `size` is set. */
  fill?: boolean;
  /** Merged onto the tile's outer div — pass rounding/ring/etc. here, since
   * the base classes below are purely structural (sizing, layout). */
  className?: string;
}) {
  const hue = hueForSlug(slug);
  const sizing =
    size != null ? "" : fill ? "h-full w-full" : "aspect-square w-full";

  return (
    <div
      className={`relative overflow-hidden ${sizing} ${className}`}
      style={{
        ...(size != null ? { width: size, height: size } : {}),
        // Establishes this tile's own box as the query container, so the
        // label span's `cqw` font-size below is relative to its width.
        containerType: "inline-size",
      } as CSSProperties}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${TEXTURE_SRC})`,
          filter: `hue-rotate(${hue}deg) saturate(1.1)`,
        }}
      />
      <span
        className="absolute inset-0 flex select-none items-center justify-center break-words text-center font-mono font-semibold leading-tight text-[#F5F1E8]"
        style={{
          fontSize: fontSizeFor(initials),
          padding: "0 10cqw",
        }}
      >
        {initials}
      </span>
    </div>
  );
}
