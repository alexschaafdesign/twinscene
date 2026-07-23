"use client";

// Stateful shared comrade components, split out for the same reason as
// components/media-pro-shared-client.tsx: "use client" turns every export
// into a client reference, and the pure helpers in comrade-shared.tsx need
// to stay callable from server components.

import { useState } from "react";
import type { Comrade } from "@/lib/comrades";
import { initials } from "@/components/comrade-shared";

/** Square profile photo with an initials fallback when missing or broken.
 * `thumb` opts into the pre-generated 400px variant for grid/list cards; the
 * profile hero leaves it off to use the full-res photo. Mirrors
 * MediaProImage's thumbnail → full photo → initials degrade order. */
export function ComradeImage({
  comrade,
  className = "",
  thumb = false,
}: {
  comrade: Comrade;
  className?: string;
  thumb?: boolean;
}) {
  const [failCount, setFailCount] = useState(0);

  const candidates = [
    thumb && comrade.thumbnail_url ? comrade.thumbnail_url : null,
    comrade.photo || null,
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
          alt={comrade.name}
          loading="lazy"
          onError={() => setFailCount((c) => c + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(comrade.name)}
          </span>
        </div>
      )}
    </div>
  );
}
