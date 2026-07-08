// Server-safe presentational helpers shared by the venue directory grid
// (VenueGrid.tsx) and the venue profile view (VenueProfile.tsx). Mirrors
// band-shared.tsx's role for bands. Venues have no photo, so there's no
// client-side image-fallback component to split out — everything here is a
// plain function/component and can be called from server components.

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

/** Icon tile standing in for a photo — venues have no IMAGE column. */
export function VenueIcon({
  venue,
  className = "",
}: {
  venue: Venue;
  className?: string;
}) {
  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[#3A332D] ${className}`}
    >
      <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
        {initials(venue.name)}
      </span>
    </div>
  );
}

/** Prefilled "correct this venue" submit URL — shown in the profile header. */
export function venueEditHref(venue: Venue): string {
  const params = new URLSearchParams({
    correct: "true",
    venue: venue.slug,
    name: venue.name,
    location: venue.city,
    neighborhood: venue.neighborhood,
    capacity: venue.capacity != null ? String(venue.capacity) : "",
    contact: venue.contact,
    notes: venue.notes,
    parking: venue.parking,
    accessibility: venue.accessibility,
    owner: venue.owner,
    type: venue.type,
  });
  return `/venues/submit?${params.toString()}`;
}
