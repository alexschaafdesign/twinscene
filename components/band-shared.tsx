"use client";

// Presentational primitives shared by the band directory grid (BandGrid.tsx)
// and the band profile view (BandProfile.tsx). Kept in their own module so the
// dependency runs one way — both consumers import from here, neither imports
// from the other.

import { useState } from "react";
import type { Band } from "@/lib/fetchBands";

/** First letters of the band's name words, up to two, for the placeholder. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

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

/** One-line "Location · Est. Year" summary; empty string when neither exists. */
export function metaLine(band: Band): string {
  const parts: string[] = [];
  if (band.location) parts.push(band.location);
  if (band.started) parts.push(`Est. ${band.started}`);
  return parts.join(" · ");
}

/** Prefix a bare URL with https:// if it has no scheme. */
export function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E8E0D0]/25 text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0]"
    >
      {children}
    </a>
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

/**
 * Format an ISO "YYYY-MM-DD" date as e.g. "Sat, Jul 12". Parsed/formatted in
 * UTC so the date never slips a day across the viewer's timezone. Unexpected
 * formats fall back to the raw string.
 */
export function formatShowDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}
