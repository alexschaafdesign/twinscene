// Shared venue profile content — the icon tile, name, location/type/capacity,
// notes, and upcoming shows at this venue. Mirrors BandProfile.tsx's layout:
// a left sidebar (icon, contact/logistics) and a wider main column (name,
// notes, shows).

import type { ReactNode } from "react";
import type { Show } from "@/lib/fetchShows";
import type { Venue } from "@/lib/fetchVenues";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import VenueShowsSection from "@/components/VenueShowsSection";
import { VenuePlaceLine } from "@/components/venue-shared";
import { VenueImage } from "@/components/venue-shared-client";
import { iconProps } from "@/components/band-shared";

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        {label}
      </h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/85">
        {value}
      </p>
    </div>
  );
}

export default function VenueProfile({
  venue,
  shows = [],
  pastShows = [],
  press = [],
  today,
  showStatuses = {},
  loggedIn = false,
  actions,
}: {
  venue: Venue;
  shows?: Show[];
  /** All past shows at this venue, most recent first — the "Past shows" tab. */
  pastShows?: Show[];
  press?: Press[];
  /** "YYYY-MM-DD" in America/Chicago, for ShowsTimeline's upcoming/past split. */
  today: string;
  /** Logged-in user's attendance status per show id. */
  showStatuses?: Record<string, ShowStatus>;
  loggedIn?: boolean;
  /** Edit/admin action buttons — the page assembles these but they render
   * inline with the venue name so the header stays a single row. */
  actions?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      {/* Icon — sidebar, top */}
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        <VenueImage
          venue={venue}
          className="rounded-md ring-1 ring-[#E8E0D0]/10"
        />
      </div>

      {/* Main content — name, type/capacity, notes, upcoming shows */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
              {venue.name}
            </h1>
            {actions && (
              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            )}
          </div>
          <VenuePlaceLine venue={venue} className="mt-2 text-sm" />
          {(venue.type || venue.capacity != null) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {venue.type && (
                <span className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75">
                  {venue.type}
                </span>
              )}
              {venue.capacity != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#E8B84B]/50 bg-gradient-to-br from-[#E8B84B]/25 via-[#E8B84B]/10 to-transparent px-2.5 py-0.5 text-xs font-semibold text-[#E8B84B]">
                  {/* ti-users (Tabler) */}
                  <svg {...iconProps} width={13} height={13} strokeWidth={2.2}>
                    <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                    <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
                  </svg>
                  {venue.capacity.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {venue.notes || "No notes yet."}
        </p>

        {/* Shows at this venue — Upcoming / Past shows tabs */}
        <VenueShowsSection
          shows={shows}
          pastShows={pastShows}
          press={press}
          today={today}
          statuses={showStatuses}
          loggedIn={loggedIn}
          venueSlug={venue.slug}
        />
      </div>

      {/* Sidebar extras — directly under the icon. Owner/Parking hidden for
          now: those fields were originally written for touring bands and
          don't fit the more general audience the page serves now. */}
      <div className="space-y-5 md:col-start-1 md:row-start-2">
        <InfoBlock label="Contact" value={venue.contact} />
        <InfoBlock label="Accessibility" value={venue.accessibility} />
      </div>
    </div>
  );
}
