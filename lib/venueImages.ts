// Per-venue fallback images. Some venues (e.g. Acadia Cafe) never publish show
// flyers, so their shows would render with no artwork at all. For those, we use
// the venue's own logo as a generic image.
//
// The Acadia scraper writes this same URL into the DB's flyer_url (so any
// consumer of the shared shows DB — e.g. the Crawlspace app — picks it up), and
// venueFallbackImage() below covers rows that predate that (not yet re-scraped
// or backfilled). Keyed by the venue_name string the scraper writes (each
// scraper's VENUE constant). It must stay byte-identical to the URL the scraper
// emits so isVenueLogo() can recognize a stored flyer_url as a logo.

const VENUE_FALLBACK_IMAGES: Record<string, string> = {
  "Acadia Cafe": "https://www.twinscene.org/venues/acadia.jpg",
};

/** The fallback logo for a venue that never has flyers, or "" if none. */
export function venueFallbackImage(venue: string): string {
  return VENUE_FALLBACK_IMAGES[venue] ?? "";
}

/** True when a URL is one of our venue-logo fallbacks (whether it arrived via
 * flyer_url from the DB or venueFallbackImage), so it can be styled as a
 * contained logo rather than a crop-filled poster. */
export function isVenueLogo(url: string): boolean {
  if (!url) return false;
  for (const logo of Object.values(VENUE_FALLBACK_IMAGES)) {
    if (url === logo) return true;
  }
  return false;
}
