"use client";

// Stateful shared media-pro components, split out for the same reason as
// components/band-shared-client.tsx: "use client" turns every export into a
// client reference, and the pure helpers in media-pro-shared.tsx need to stay
// callable from server components.

import { useState } from "react";
import type { MediaPro } from "@/lib/mediaPros";
import { initials } from "@/components/media-pro-shared";

/** Square profile photo with an initials fallback when missing or broken.
 * `thumb` opts into the pre-generated 400px variant for grid/list cards; the
 * profile hero leaves it off to use the full-res photo. Mirrors BandImage's
 * thumbnail → full photo → initials degrade order. */
export function MediaProImage({
  mediaPro,
  className = "",
  thumb = false,
}: {
  mediaPro: MediaPro;
  className?: string;
  thumb?: boolean;
}) {
  const [failCount, setFailCount] = useState(0);

  const candidates = [
    thumb && mediaPro.thumbnail_url ? mediaPro.thumbnail_url : null,
    mediaPro.photo || null,
  ].filter((s): s is string => !!s);
  const src = candidates[failCount] ?? null;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- photo comes from R2, an arbitrary external host
        <img
          src={src}
          alt={mediaPro.name}
          loading="lazy"
          onError={() => setFailCount((c) => c + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(mediaPro.name)}
          </span>
        </div>
      )}
    </div>
  );
}
