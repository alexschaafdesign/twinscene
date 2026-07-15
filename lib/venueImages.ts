// Per-venue fallback images. Some venues (e.g. Acadia Cafe) never publish show
// flyers, so their shows would render with no artwork at all. For those, we fall
// back to the venue's own logo — a generic image that's better than a blank slot.
//
// Keyed by the venue_name string the scraper writes (see each scraper's VENUE
// constant). Values are paths under public/, served from the site root.

const VENUE_FALLBACK_IMAGES: Record<string, string> = {
  "Acadia Cafe": "/venues/acadia.jpg",
};

/** The fallback logo for a venue that never has flyers, or "" if none. */
export function venueFallbackImage(venue: string): string {
  return VENUE_FALLBACK_IMAGES[venue] ?? "";
}
