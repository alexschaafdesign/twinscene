"use client";

import { useState } from "react";
import type { UpcomingShowStatus } from "@/lib/showSaves";
import { formatShowDate } from "@/components/band-shared";
import { showHeading } from "@/lib/showDisplay";
import { ShowStatusButtons } from "@/components/ShowStatusButtons";

// "Shows you're interested in" list on /profile, soonest first. Clearing a
// show's status (via ShowStatusButtons) drops it from the list immediately,
// same optimistic-removal pattern as SavedBandsList/FollowedBandsList use for
// unsave/unfollow. Rows with a legacy "going" status (from before that option
// was dropped) still show up here — listUpcomingForUser matches on both.
export default function UpcomingShowsList({ initialShows }: { initialShows: UpcomingShowStatus[] }) {
  const [shows, setShows] = useState(initialShows);

  if (shows.length === 0) {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/50">
        No upcoming shows tracked yet. Mark yourself interested from the shows
        list.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <ul className="flex flex-col gap-2">
        {shows.map((s) => (
          <li
            key={s.show_id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium text-[#E8E0D0]">{formatShowDate(s.date)}</span>
              <span className="text-[#E8E0D0]/50"> — {showHeading({ lineup: s.lineup, title: s.title, venue: s.venue_name })}</span>
              {s.venue_name && <span className="text-[#E8E0D0]/50"> ({s.venue_name})</span>}
            </div>
            <ShowStatusButtons
              showId={s.show_id}
              isPast={false}
              initialStatus={s.status}
              loggedIn={true}
              returnTo="/profile"
              onStatusChange={(status) => {
                if (status === null) {
                  setShows((cur) => cur.filter((x) => x.show_id !== s.show_id));
                }
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
