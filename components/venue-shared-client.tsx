"use client";

// Stateful shared venue components. Split out from venue-shared.tsx because
// "use client" turns every export into a client reference — and the pure
// helpers there need to be callable directly from server components. Mirrors
// band-shared-client.tsx's BandImage for venues.

import { useState } from "react";
import type { Venue } from "@/lib/fetchVenues";
import { initials } from "@/components/venue-shared";

/** Square venue image with an initials fallback when missing or broken.
 *
 * `thumb` opts into the small pre-generated 400px variant
 * (venues/thumb/<slug>.jpg) — use it for grid/list cards, where the full-res
 * photo is a 5–25x over-fetch. Leave it off for the profile hero, which is
 * rendered large enough to want the original. The source degrades in order:
 * thumbnail → full photo → initials, so a venue not yet backfilled (no
 * thumbnailUrl) or a 404'd thumbnail still shows its photo rather than
 * dropping straight to initials. */
export function VenueImage({
  venue,
  className = "",
  thumb = false,
}: {
  venue: Venue;
  className?: string;
  thumb?: boolean;
}) {
  const [failCount, setFailCount] = useState(0);

  // Priority list of sources to try; onError advances to the next one.
  const candidates = [
    thumb && venue.thumbnailUrl ? venue.thumbnailUrl : null,
    venue.photo || null,
  ].filter((s): s is string => !!s);
  const src = candidates[failCount] ?? null;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- venue photos come from arbitrary external hosts
        <img
          src={src}
          alt={venue.name}
          loading="lazy"
          onError={() => setFailCount((c) => c + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(venue.name)}
          </span>
        </div>
      )}
    </div>
  );
}
