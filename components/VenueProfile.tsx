// Shared venue profile content — the icon tile, name, location/type/capacity,
// notes, and upcoming shows at this venue. Mirrors BandProfile.tsx's layout:
// a left sidebar (icon, contact/logistics) and a wider main column (name,
// notes, shows).

import type { Show } from "@/lib/fetchShows";
import type { Venue } from "@/lib/fetchVenues";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import ShowsTimeline from "@/components/ShowsTimeline";
import { VenueIcon, VenuePlaceLine } from "@/components/venue-shared";

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
  press = [],
  today,
  showStatuses = {},
  loggedIn = false,
}: {
  venue: Venue;
  shows?: Show[];
  press?: Press[];
  /** "YYYY-MM-DD" in America/Chicago, for ShowsTimeline's upcoming/past split. */
  today: string;
  /** Logged-in user's attendance status per show id. */
  showStatuses?: Record<string, ShowStatus>;
  loggedIn?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      {/* Icon — sidebar, top */}
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        <VenueIcon
          venue={venue}
          className="rounded-md ring-1 ring-[#E8E0D0]/10"
        />
      </div>

      {/* Main content — name, type/capacity, notes, upcoming shows */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        <div>
          <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
            {venue.name}
          </h1>
          <VenuePlaceLine venue={venue} className="mt-2 text-sm" />
          {(venue.type || venue.capacity != null) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {venue.type && (
                <span className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75">
                  {venue.type}
                </span>
              )}
              {venue.capacity != null && (
                <span className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75">
                  Capacity {venue.capacity}
                </span>
              )}
            </div>
          )}
        </div>

        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {venue.notes || "No notes yet."}
        </p>

        {/* Upcoming shows at this venue */}
        <div>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Upcoming shows
          </h2>
          <ShowsTimeline
            shows={shows}
            press={press}
            today={today}
            statuses={showStatuses}
            loggedIn={loggedIn}
            returnTo={`/venues/${venue.slug}`}
            emptyMessage="No upcoming shows listed at this venue yet."
          />
        </div>
      </div>

      {/* Sidebar extras — directly under the icon */}
      <div className="space-y-5 md:col-start-1 md:row-start-2">
        <InfoBlock label="Contact" value={venue.contact} />
        <InfoBlock label="Owner" value={venue.owner} />
        <InfoBlock label="Parking" value={venue.parking} />
        <InfoBlock label="Accessibility" value={venue.accessibility} />
      </div>
    </div>
  );
}
