// Cross-request caching for the site's hot, shared, non-user-specific DB reads.
//
// The public directory pages (home, /bands, /bands/[slug], /shows, /shows/[id],
// /venues, /venues/[slug]) render per request because the root layout reads the
// logged-in user for the header — so they can't be statically prerendered. But
// the expensive part of each render is a handful of Postgres reads that return
// the SAME data for every visitor (the 272-band grid, upcoming shows, the venue
// list). Those are wrapped here in unstable_cache so the query runs once and is
// shared across all users until invalidated, instead of hitting the DB on every
// page view (the per-view-query problem noted in perf-baseline.md).
//
// Freshness: each wrapper carries a category tag (lib/cacheTags.ts); the write
// routes call the matching revalidate* helper below after a successful mutation,
// so an edit is reflected immediately. The `revalidate` floors are a safety net
// if a tag call is ever missed.
//
// The shows wrappers additionally take today's Chicago date as a cache-key
// discriminator (the functions still compute it internally — the arg only shapes
// the key). Because fetchShows()/fetchPastShows() filter by today's date, their
// result is only valid for the current day; folding the date into the key makes
// the cache miss and refetch the instant the Chicago date ticks past midnight,
// instead of serving yesterday's upcoming shows until the hourly floor expires.
//
// IMPORTANT: only display/read code (app pages, read-only routes) should import
// from here. Write routes and admin views deliberately keep calling the RAW
// functions (lib/bands, lib/fetchShows, …) so they read fresh, uncached data —
// e.g. a write route reads the row it's about to update, then revalidates.
//
// This is also the only module allowed to import next/cache on the lib side:
// keeping that import out of the raw data files (lib/bands.ts etc.) is what lets
// plain-node scripts keep importing them (see lib/cacheTags.ts).

import { unstable_cache, revalidateTag } from "next/cache";
import { fetchBands, fetchBandsBySlugs } from "./fetchBands.ts";
import { getBandBySlug } from "./bands.ts";
import {
  fetchShows,
  fetchShowById,
  fetchPastShows,
  fetchAllPastShows,
} from "./fetchShows.ts";
import { fetchVenues } from "./fetchVenues.ts";
import { getVenueBySlug } from "./venues.ts";
import { getSlugsWithVideos, getVisibleVideosBySlug } from "./videos.ts";
import { CACHE_TAGS } from "./cacheTags.ts";

const DAY = 86_400;
const HOUR = 3_600;

// --- Bands (tag-invalidated on any band edit; daily floor) ---
export const getCachedBands = unstable_cache(fetchBands, ["cached-bands"], {
  tags: [CACHE_TAGS.bands],
  revalidate: DAY,
});
export const getCachedBandsBySlugs = unstable_cache(fetchBandsBySlugs, ["cached-bands-by-slugs"], {
  tags: [CACHE_TAGS.bands],
  revalidate: DAY,
});
export const getCachedBandBySlug = unstable_cache(getBandBySlug, ["cached-band-by-slug"], {
  tags: [CACHE_TAGS.bands],
  revalidate: DAY,
});

// --- Shows (keyed on today's date so the list rolls over at Chicago midnight;
//     hourly floor as the within-day safety net) ---
export const getCachedShows = unstable_cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- today is a cache-key discriminator only
  (today: string) => fetchShows(),
  // v2: the cached Show shape gained localBandSlugs (0059); a fresh key forces a
  // recompute rather than serving pre-0059 entries that lack the field.
  ["cached-shows-v2"],
  { tags: [CACHE_TAGS.shows], revalidate: HOUR },
);
export const getCachedShowById = unstable_cache(fetchShowById, ["cached-show-by-id-v2"], {
  tags: [CACHE_TAGS.shows],
  revalidate: HOUR,
});
export const getCachedPastShows = unstable_cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- today is a cache-key discriminator only
  (days: number, today: string) => fetchPastShows(days),
  ["cached-past-shows-v2"], // v2: see getCachedShows — Show gained localBandSlugs (0059)
  { tags: [CACHE_TAGS.shows], revalidate: HOUR },
);
export const getCachedAllPastShows = unstable_cache(fetchAllPastShows, ["cached-all-past-shows-v2"], {
  tags: [CACHE_TAGS.shows],
  revalidate: HOUR,
});

// --- Venues (tag-invalidated on venue write; daily floor) ---
export const getCachedVenues = unstable_cache(fetchVenues, ["cached-venues"], {
  tags: [CACHE_TAGS.venues],
  revalidate: DAY,
});
export const getCachedVenueBySlug = unstable_cache(getVenueBySlug, ["cached-venue-by-slug"], {
  tags: [CACHE_TAGS.venues],
  revalidate: DAY,
});

// --- Videos (tag-invalidated when a band's videos change; daily floor) ---
export const getCachedSlugsWithVideos = unstable_cache(getSlugsWithVideos, ["cached-video-slugs"], {
  tags: [CACHE_TAGS.videos],
  revalidate: DAY,
});
export const getCachedVisibleVideosBySlug = unstable_cache(
  getVisibleVideosBySlug,
  ["cached-band-videos"],
  { tags: [CACHE_TAGS.videos], revalidate: DAY },
);

// --- Invalidation, called from write routes after a successful mutation ---
//
// `{ expire: 0 }` is the second argument this Next build requires on
// revalidateTag from a Route Handler (updateTag is Server-Actions-only). It
// expires the tag immediately rather than the default stale-while-revalidate,
// so an editor who just saved sees fresh data on their next load — a
// read-your-own-writes guarantee — at the cost of one blocking refetch on the
// first read after a write. That trade is right here: writes are rare and the
// alternative (briefly serving the editor their pre-edit profile) is confusing.
const EXPIRE_NOW = { expire: 0 } as const;

export function revalidateBands(): void {
  revalidateTag(CACHE_TAGS.bands, EXPIRE_NOW);
}
export function revalidateShows(): void {
  revalidateTag(CACHE_TAGS.shows, EXPIRE_NOW);
}
export function revalidateVenues(): void {
  revalidateTag(CACHE_TAGS.venues, EXPIRE_NOW);
}
export function revalidateVideos(): void {
  revalidateTag(CACHE_TAGS.videos, EXPIRE_NOW);
}
