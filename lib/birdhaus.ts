// Server-side client for Birdhaus's public band-data API. Twin Scene used to
// read the band directory straight out of a Google Sheet (see the dead code
// kept at the bottom of lib/fetchBands.ts); bands now live in Birdhaus's own
// DB, exposed through this API-key-gated read endpoint.
//
// Freshness: mirrors the pattern the old sheet reader used elsewhere in this
// codebase (fetchShows.ts, fetchVenues.ts, etc.) — fetch live on every call
// with `cache: "no-store"`, no ISR/revalidate window. `lastGood` below is not
// a freshness mechanism; it's purely a fallback so a transient Birdhaus
// outage shows stale data instead of an empty directory.
const BIRDHAUS_API_URL = "https://thebirdhaus.org/api/public/bands";

export type FeaturedLink = { url: string; label: string; image: string };

export type BirdhausBand = {
  slug: string;
  name: string;
  instagram: string;
  bio: string;
  photo: string;
  isTouring: boolean;
  hometown: string;
  genres: string[];
  city: string;
  neighborhoods: string[];
  website: string;
  bandcamp: string;
  bandcampEmbedUrl: string;
  bandcampEmbedHeight: number;
  featuredLinks: FeaturedLink[];
};

// Last successful response, held in memory for this warm instance only.
let lastGood: BirdhausBand[] | null = null;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asFeaturedLinks(v: unknown): FeaturedLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      url: asString(l.url),
      label: asString(l.label),
      image: asString(l.image),
    }))
    .filter((l) => l.url);
}

/** Defensively coerce one API record — the endpoint is owned by another
 * codebase, so don't trust its shape blindly. Drops records missing the two
 * fields everything downstream keys off of. */
function parseBand(raw: unknown): BirdhausBand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!asString(r.slug) || !asString(r.name)) return null;

  return {
    slug: asString(r.slug),
    name: asString(r.name),
    instagram: asString(r.instagram),
    bio: asString(r.bio),
    photo: asString(r.photo),
    isTouring: r.isTouring === true,
    hometown: asString(r.hometown),
    genres: asStringArray(r.genres),
    city: asString(r.city),
    neighborhoods: asStringArray(r.neighborhoods),
    website: asString(r.website),
    bandcamp: asString(r.bandcamp),
    bandcampEmbedUrl: asString(r.bandcampEmbedUrl),
    bandcampEmbedHeight:
      typeof r.bandcampEmbedHeight === "number" ? r.bandcampEmbedHeight : 120,
    featuredLinks: asFeaturedLinks(r.featuredLinks),
  };
}

export async function fetchBirdhausBands(): Promise<BirdhausBand[]> {
  const apiKey = process.env.BIRDHAUS_API_KEY;
  if (!apiKey) {
    console.error("fetchBirdhausBands: BIRDHAUS_API_KEY is not set");
    return lastGood ?? [];
  }

  let body: unknown;
  try {
    const res = await fetch(BIRDHAUS_API_URL, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`fetchBirdhausBands: request failed (${res.status})`);
      return lastGood ?? [];
    }
    body = await res.json();
  } catch (err) {
    console.error("fetchBirdhausBands: failed to fetch", err);
    return lastGood ?? [];
  }

  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as Record<string, unknown>)?.bands)
      ? (body as Record<string, unknown>).bands
      : null;
  if (!Array.isArray(list)) {
    console.error("fetchBirdhausBands: unexpected response shape");
    return lastGood ?? [];
  }

  const bands = list.map(parseBand).filter((b): b is BirdhausBand => b !== null);
  lastGood = bands;
  return bands;
}

// Lineup-to-band matching (lib/shows.ts) needs the bands list once per show
// write, not once per lineup entry — a 12-venue scrape run would otherwise
// hammer this endpoint dozens of times in a few seconds. This is a bare TTL
// wrapper around fetchBirdhausBands() above, not a new caching layer: same
// live-fetch-with-fallback function underneath, just not re-hit within the
// same short window.
const MATCH_CACHE_TTL_MS = 60_000;
let matchCache: { bands: BirdhausBand[]; expiresAt: number } | null = null;

export async function getCachedBirdhausBands(): Promise<BirdhausBand[]> {
  if (matchCache && matchCache.expiresAt > Date.now()) return matchCache.bands;
  const bands = await fetchBirdhausBands();
  matchCache = { bands, expiresAt: Date.now() + MATCH_CACHE_TTL_MS };
  return bands;
}
