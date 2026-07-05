"use client";

// Stateful shared band components. Split out from band-shared.tsx because
// "use client" turns every export into a client reference — and the pure
// helpers there need to be callable directly from server components. These two
// use React state, so they belong on the client. Server components can still
// *render* them.

import { useState } from "react";
import type { Band } from "@/lib/fetchBands";
import { iconProps, initials } from "@/components/band-shared";

/** Square band image with an initials fallback when missing or broken. */
export function BandImage({
  band,
  className = "",
}: {
  band: Band;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = band.image && !errored;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- band art comes from arbitrary external hosts
        <img
          src={band.image}
          alt={band.name}
          loading="lazy"
          onError={() => setErrored(true)}
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
