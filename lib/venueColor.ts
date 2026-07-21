// Deterministic per-venue hue for the shared VenueAvatar texture. Hashed off
// `slug`, not `name` — a venue rename shouldn't reshuffle its color.

/** Standard string hash (hash = hash*31 + charCode), folded to a 0-360 hue. */
export function hueForSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// First-letters auto-derive for venues with no manually-set avatar_initials —
// same rule venue-shared.tsx's `initials` already uses for the old fallback.
export { initials as autoInitials } from "@/components/venue-shared";
