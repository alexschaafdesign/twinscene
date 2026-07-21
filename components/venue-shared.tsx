// Server-safe presentational helpers shared by the venue directory grid
// (VenueGrid.tsx) and the venue profile view (VenueProfile.tsx). Mirrors
// band-shared.tsx's role for bands. The photo/fallback-initials image itself
// (VenueImage) needs onError state, so it lives in venue-shared-client.tsx —
// mirroring band-shared-client.tsx's BandImage split — but `initials` is kept
// here so both that client component and any server-rendered fallback can
// share it.

import type { Venue } from "@/lib/fetchVenues";

/** First letters of the venue's name words, up to two, for the icon tile. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Human-readable place: "Neighborhood, City" (or just one, or neither).
 * Mirrors band-shared's locationLabel/PlaceLine for the single-neighborhood
 * Venue shape.
 */
export function venueLocationLabel(venue: Venue): string {
  if (venue.neighborhood && venue.city) {
    return `${venue.neighborhood}, ${venue.city}`;
  }
  return venue.neighborhood || venue.city;
}

export function VenuePlaceLine({
  venue,
  className = "",
}: {
  venue: Venue;
  className?: string;
}) {
  const hasPlace = !!venue.neighborhood || !!venue.city;
  if (!hasPlace) return null;

  return (
    <p className={`truncate text-[#E8E0D0]/55 ${className}`}>
      {venue.neighborhood && (
        <span className="text-[#E8E0D0]/85">{venue.neighborhood}</span>
      )}
      {venue.neighborhood && venue.city ? ", " : ""}
      {venue.city}
    </p>
  );
}

/** Prefilled "correct this venue" submit URL — shown in the profile header. */
export function venueEditHref(venue: Venue): string {
  const params = new URLSearchParams({
    correct: "true",
    venue: venue.slug,
    name: venue.name,
    address: venue.address,
    addressPrivate: venue.addressPrivate ? "true" : "",
    location: venue.city,
    neighborhood: venue.neighborhood,
    capacity: venue.capacity != null ? String(venue.capacity) : "",
    contact: venue.contact,
    notes: venue.notes,
    parking: venue.parking,
    accessibility: venue.accessibility,
    owner: venue.owner,
    type: venue.type,
    image: venue.photo,
  });
  return `/venues/submit?${params.toString()}`;
}
