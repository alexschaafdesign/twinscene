"use client";

// Stateful shared band components. Split out from band-shared.tsx because
// "use client" turns every export into a client reference — and the pure
// helpers there need to be callable directly from server components. These two
// use React state, so they belong on the client. Server components can still
// *render* them.

import { useState } from "react";
import type { Band } from "@/lib/fetchBands";
import { iconProps, initials } from "@/components/band-shared";

/** Square band image with an initials fallback when missing or broken.
 *
 * `thumb` opts into the small pre-generated 400px variant (bands/thumb/<slug>.jpg)
 * — use it for grid/list cards, where the full-res photo is a 5–25x over-fetch.
 * Leave it off for the profile hero, which is rendered large enough to want the
 * original. The source degrades in order: thumbnail → full photo → initials, so
 * a band not yet backfilled (no thumbnailUrl) or a 404'd thumbnail still shows
 * its photo rather than dropping straight to initials. */
export function BandImage({
  band,
  className = "",
  thumb = false,
}: {
  band: Band;
  className?: string;
  thumb?: boolean;
}) {
  const [failCount, setFailCount] = useState(0);

  // Priority list of sources to try; onError advances to the next one.
  const candidates = [
    thumb && band.thumbnailUrl ? band.thumbnailUrl : null,
    band.image || null,
  ].filter((s): s is string => !!s);
  const src = candidates[failCount] ?? null;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- band art comes from arbitrary external hosts
        <img
          src={src}
          alt={band.name}
          loading="lazy"
          onError={() => setFailCount((c) => c + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(band.name)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Copies `text` to the clipboard, briefly showing a "Copied" confirmation. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be unavailable (e.g. insecure context) — ignore.
        }
      }}
      className="inline-flex items-center gap-1 text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
    >
      {/* ti-copy (Tabler) */}
      <svg {...iconProps} width={15} height={15}>
        <path d="M8 10a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
        <path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
      {copied && <span className="text-xs text-[#8FD693]">Copied</span>}
    </button>
  );
}
