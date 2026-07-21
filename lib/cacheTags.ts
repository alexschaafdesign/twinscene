// Cache tags for the shared, non-user-specific DB reads that lib/cachedReads.ts
// memoizes via unstable_cache. Coarse by design: one tag per content category,
// so any write in a category invalidates every cached read in it. Writes here
// are infrequent and batched (occasional profile edits, the nightly scrape), so
// category-wide invalidation is simpler than per-row tags at no real cost.
//
// This module holds ONLY string constants and imports nothing from next/cache,
// so it stays importable from plain-node scripts (some of which pull in lib
// files transitively — e.g. scripts/undercurrent-backfill.ts imports lib/bands).
// Everything coupled to next/cache lives in lib/cachedReads.ts, which app code
// imports but scripts never do.
export const CACHE_TAGS = {
  bands: "bands",
  shows: "shows",
  venues: "venues",
  videos: "videos",
} as const;
