// Offline neighborhood lookup: given a lng/lat, find which Minneapolis or
// St. Paul neighborhood it falls in. Boundaries are bundled as GeoJSON in
// twinCitiesNeighborhoods.json (Minneapolis "Neighborhoods" + St. Paul
// "District Councils", coordinates rounded to ~1m). Pairs with lib/geocode.ts,
// which turns a street address into the point this consumes — together they
// power the venue form's "Detect neighborhood from address" button. No network
// call and no API key here; only the geocode step hits an external service.

import raw from "./twinCitiesNeighborhoods.json";
import { NEIGHBORHOOD_OPTIONS } from "@/lib/neighborhoods";

// Map the boundary source's official names onto the app's existing seed
// vocabulary when they're the same place spelled differently (e.g. official
// "Cedar Riverside" -> the directory's "Cedar-Riverside"), keyed on an
// alphanumeric-only, case-insensitive normalization. Anything with no seed
// equivalent (most granular Minneapolis neighborhoods) keeps its official name.
const canonicalKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SEED_BY_KEY = new Map(
  NEIGHBORHOOD_OPTIONS.map((n) => [canonicalKey(n), n]),
);
const canonicalizeName = (name: string) =>
  SEED_BY_KEY.get(canonicalKey(name)) ?? name;

type Ring = [number, number][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
type NeighborhoodShape = { name: string; city: string; geometry: Geometry };

const NEIGHBORHOODS = raw as NeighborhoodShape[];

/** Ray-casting point-in-ring test. `ring` is a closed [lng, lat] loop. */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** A GeoJSON Polygon is [outerRing, ...holes]: inside the outer ring but not
 * inside any hole. */
function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lng, lat, rings[h])) return false; // in a hole
  }
  return true;
}

function pointInGeometry(lng: number, lat: number, geom: Geometry): boolean {
  if (geom.type === "Polygon") return pointInPolygon(lng, lat, geom.coordinates);
  return geom.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
}

/** The neighborhood (and its city) containing this point, or null if it's
 * outside every bundled Minneapolis/St. Paul boundary (e.g. a suburb). */
export function findNeighborhood(
  lng: number,
  lat: number,
): { neighborhood: string; city: string } | null {
  for (const n of NEIGHBORHOODS) {
    if (pointInGeometry(lng, lat, n.geometry)) {
      return { neighborhood: canonicalizeName(n.name), city: n.city };
    }
  }
  return null;
}
