// Server-safe presentational helpers shared by the band directory grid
// (BandGrid.tsx) and the band profile view (BandProfile.tsx). These are plain
// functions/constants and stateless components, so they can be *called* from
// server components. Stateful pieces (BandImage, CopyButton) live in
// band-shared-client.tsx, which is marked "use client".

import type { Band } from "@/lib/fetchBands";

/** First letters of the band's name words, up to two, for the placeholder. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Human-readable place: "Neighborhood, City" (or just one, or neither).
 * Multiple neighborhoods are comma-joined before the city, e.g.
 * "Seward, Longfellow, Minneapolis".
 */
export function locationLabel(band: Band): string {
  const hoods = band.neighborhoods.join(", ");
  if (hoods && band.city) return `${hoods}, ${band.city}`;
  return hoods || band.city;
}

/**
 * Location as a single line, e.g. "Seward, Longfellow, Minneapolis".
 * Neighborhoods (the hyper-local bit) render slightly brighter than the city
 * so they read as the notable detail. Renders nothing when there's no place.
 * `className` tunes size/spacing per context (card vs. profile).
 */
export function PlaceLine({
  band,
  className = "",
}: {
  band: Band;
  className?: string;
}) {
  const hasHoods = band.neighborhoods.length > 0;
  const hasPlace = hasHoods || !!band.city;
  if (!hasPlace) return null;

  return (
    <p className={`truncate text-[#E8E0D0]/55 ${className}`}>
      {hasHoods && (
        <span className="text-[#E8E0D0]/85">
          {band.neighborhoods.join(", ")}
        </span>
      )}
      {hasHoods && band.city ? ", " : ""}
      {band.city}
    </p>
  );
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
