"use client";

import { useState } from "react";
import type { AttendedShow } from "@/lib/showSaves";
import { formatShowDate } from "@/components/band-shared";
import { showHeading } from "@/lib/showDisplay";
import { ShowStatusButtons } from "@/components/ShowStatusButtons";

// "Shows you've been to" list on /profile — shows marked 'went', most recent
// first. Clearing (via ShowStatusButtons' past-show toggle) drops it from the
// list immediately, same optimistic-removal pattern as the other profile lists.
export default function AttendedShowsList({ initialShows }: { initialShows: AttendedShow[] }) {
  const [shows, setShows] = useState(initialShows);

  if (shows.length === 0) {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/50">
        No shows marked as attended yet.
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
              isPast={true}
              initialStatus="went"
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
