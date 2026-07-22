// Geocode a US street address to lng/lat via the free US Census Geocoder —
// no API key, no cost, US addresses only (which is all Twin Scene needs). Used
// by the venue "Detect neighborhood from address" flow (app/api/venues/
// detect-neighborhood), which then point-in-polygons the result against the
// bundled boundaries in lib/geo/neighborhoods.ts.
//
// The Census onelineaddress endpoint resolves best with a city + state, so
// callers pass those when known; we default the state to MN.

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

type CensusResponse = {
  result?: {
    addressMatches?: { coordinates?: { x: number; y: number } }[];
  };
};

/** One Census onelineaddress lookup. Returns null on no match, a bad response,
 * or a network error. */
async function geocodeOne(
  oneline: string,
): Promise<{ lng: number; lat: number } | null> {
  if (!oneline.trim()) return null;
  const url =
    `${CENSUS_URL}?address=${encodeURIComponent(oneline)}` +
    `&benchmark=Public_AR_Current&format=json`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      // The Census service can be slow; don't hang the request forever.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CensusResponse;
    const coords = data.result?.addressMatches?.[0]?.coordinates;
    if (!coords || typeof coords.x !== "number" || typeof coords.y !== "number") {
      return null;
    }
    return { lng: coords.x, lat: coords.y };
  } catch {
    return null;
  }
}

/** Best-effort geocode. Returns null on no match, a bad response, or a network
 * error — the caller treats "no coordinates" and "no neighborhood" the same.
 *
 * Some stored addresses are a bare street ("204 N 1st St"), others already
 * carry city/state/zip ("204 N 1st St, Minneapolis, MN 55401"). Appending
 * city/state to an already-complete address duplicates them and the Census
 * matcher returns nothing — so try the address AS-IS first, then fall back to
 * appending city/state for the bare-street case. */
export async function geocodeAddress(
  address: string,
  city?: string,
  state = "MN",
): Promise<{ lng: number; lat: number } | null> {
  if (!address.trim()) return null;
  return (
    (await geocodeOne(address.trim())) ??
    (await geocodeOne(
      [address.trim(), city?.trim(), state].filter(Boolean).join(", "),
    ))
  );
}
