// Pure venue helpers with no server-only dependencies. lib/venues.ts (the
// Postgres data layer) imports lib/db.ts, which pulls in the `postgres`
// client — importing anything from that module chain into a client component
// (VenueSubmitForm.tsx, ShowsList.tsx) would bundle `postgres` into the
// browser. Keeping slugify()/matchVenue() dependency-free here, and having
// both lib/venues.ts and lib/fetchVenues.ts import from here rather than
// defining their own, means client components can import these directly
// without pulling in Postgres.

export type Venue = {
  name: string;
  slug: string;
  address: string; // street address; "" when none or private
  addressPrivate: boolean; // DIY venue: "DM venue for address"
  manualScrape: boolean; // no auto-scraper — enter shows by hand
  city: string;
  neighborhood: string; // single value, unlike Band.neighborhoods
  lat: number | null; // geocoded from address; null when private/unknown
  lng: number | null;
  // Fallback location for venues with no exact coords but a known neighborhood:
  // the neighborhood's centroid. Null when there's no neighborhood match. Used
  // to place an APPROXIMATE map pin; never a substitute for real coords.
  approxLat: number | null;
  approxLng: number | null;
  capacity: number | null;
  contact: string;
  notes: string;
  parking: string;
  accessibility: string;
  owner: string;
  type: string; // free-form (e.g. "Independent", "DIY", "First Ave", "Brewery")
  photo: string; // full-resolution photo; "" when none
  thumbnailUrl: string; // 400px square variant for grid/list cards; "" when none
  shortName: string; // display name for grid cards; "" falls back to `name`
  avatarInitials: string; // manually-set VenueAvatar label (usually initials, but a short word fits too); "" falls back to an auto-derive from `name`
  hidden: boolean; // admin archive flag (migration 0052); always false in public reads, only the admin panel sees it true
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Resolve a Show's free-text venue name to a Venue row. Normalized
// (trim+lowercase) exact match first; falling back to substring containment
// either direction, since scraper-written venue names don't always match the
// directory's names verbatim (e.g. "Cloudland" vs scraped "Cloudland Theater").
// Generic over any name-bearing shape so both the plain-string `Venue` above
// and lib/venues.ts's nullable DB row can share one implementation.
export function matchVenue<T extends { name: string }>(
  venues: T[],
  showVenueName: string,
): T | undefined {
  const target = showVenueName.trim().toLowerCase();
  if (!target) return undefined;

  const exact = venues.find((v) => v.name.trim().toLowerCase() === target);
  if (exact) return exact;

  return venues.find((v) => {
    const name = v.name.trim().toLowerCase();
    return name && (target.includes(name) || name.includes(target));
  });
}
