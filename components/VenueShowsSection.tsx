"use client";

// Upcoming/Past tab toggle for a venue profile's shows list. Split out from
// VenueProfile (a server component) since the tab needs client-side state;
// mirrors the Upcoming/Recent toggle on ShowsList.tsx but scoped to one venue
// and with an unwindowed "all past shows" tab rather than a 30-day slice.

import { useState } from "react";
import type { Show } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import ShowsTimeline from "@/components/ShowsTimeline";

export default function VenueShowsSection({
  shows,
  pastShows,
  press,
  today,
  statuses,
  loggedIn,
  venueSlug,
}: {
  shows: Show[];
  pastShows: Show[];
  press: Press[];
  today: string;
  statuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  venueSlug: string;
}) {
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const activeShows = view === "past" ? pastShows : shows;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
          Shows
        </h2>
        <div className="flex items-center gap-0.5 rounded-md border border-[#E8E0D0]/20 p-0.5">
          <button
            type="button"
            onClick={() => setView("upcoming")}
            aria-pressed={view === "upcoming"}
            className={`rounded px-2.5 py-1 text-xs transition ${
              view === "upcoming"
                ? "bg-[#E8E0D0] text-[#2A2420]"
                : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
            }`}
          >
            Upcoming ({shows.length})
          </button>
          <button
            type="button"
            onClick={() => setView("past")}
            aria-pressed={view === "past"}
            className={`rounded px-2.5 py-1 text-xs transition ${
              view === "past"
                ? "bg-[#E8E0D0] text-[#2A2420]"
                : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
            }`}
          >
            Past shows ({pastShows.length})
          </button>
        </div>
      </div>

      <ShowsTimeline
        shows={activeShows}
        press={press}
        today={today}
        statuses={statuses}
        loggedIn={loggedIn}
        returnTo={`/venues/${venueSlug}`}
        emptyMessage={
          view === "past"
            ? "No past shows on record at this venue."
            : "No upcoming shows listed at this venue yet."
        }
      />
    </div>
  );
}
