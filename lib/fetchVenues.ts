// Data layer for the venue directory — booking notes + metadata for venues
// shows get played at. Venues now live in Twin Scene's own canonical
// `venues` table (lib/venues.ts); this module adapts that DB row shape to
// the plain-string Venue type the rest of the app expects, so this swap
// didn't require touching any rendering code.
//
// History: this file used to read a public Google Sheet tab directly as CSV
// (same spreadsheet fetchShows.ts/fetchBands.ts used, gid=547847398), with
// writes going through a Google Apps Script webhook. See lib/venues.ts's
// header for the migration this mirrors (bands, Phase 1 API + Phase 2 data
// migration).
//
// Server-only: this file imports lib/venues.ts, which pulls in lib/db.ts's
// Postgres client. Client components that only need `slugify`/`matchVenue`/
// the `Venue` type (VenueSubmitForm.tsx, ShowsList.tsx) import those straight
// from lib/venueUtils.ts instead, so they don't bundle Postgres.

import { getAllVenues, type Venue as VenueRow } from "./venues";
import { type Venue, slugify, matchVenue } from "./venueUtils";

export type { Venue };
export { slugify, matchVenue };

function toVenue(row: VenueRow): Venue {
  return {
    name: row.name,
    slug: row.slug,
    address: row.address ?? "",
    addressPrivate: row.address_private,
    manualScrape: row.manual_scrape,
    city: row.city ?? "",
    neighborhood: row.neighborhood ?? "",
    capacity: row.capacity,
    contact: row.contact ?? "",
    notes: row.notes ?? "",
    parking: row.parking ?? "",
    accessibility: row.accessibility ?? "",
    owner: row.owner ?? "",
    type: row.type ?? "",
    photo: row.photo ?? "",
    thumbnailUrl: row.thumbnail_url ?? "",
  };
}

export async function fetchVenues(): Promise<Venue[]> {
  const rows = await getAllVenues();
  return rows.map(toVenue);
}
