"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Show } from "@/lib/fetchShows";
import { matchVenue, type Venue } from "@/lib/fetchVenues";
import ShowsTimeline from "@/components/ShowsTimeline";

// Number of venue chips to show before collapsing the rest under "Show more".
const VISIBLE_VENUE_COUNT = 8;

export default function ShowsList({
  shows,
  venues: venueDirectory,
}: {
  shows: Show[];
  venues: Venue[];
}) {
  const [venue, setVenue] = useState<string>("");
  const [showAllVenues, setShowAllVenues] = useState(false);
  const [venueType, setVenueType] = useState<string>("");

  // Distinct venues (with counts), busiest first (ties broken alphabetically).
  const venues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shows) {
      const v = s.venue.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [shows]);

  // Distinct venue types (with counts) among upcoming shows, busiest first —
  // same derivation as `venues` above, since the vocabulary lives in the
  // sheet's TYPE column rather than a fixed list.
  const venueTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shows) {
      const type = matchVenue(venueDirectory, s.venue)?.type;
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [shows, venueDirectory]);

  const topVenues = venues.slice(0, VISIBLE_VENUE_COUNT);
  const restVenues = venues.slice(VISIBLE_VENUE_COUNT);
  // Keep the active venue's chip visible even if it's outside the top N.
  const activeInRest = restVenues.some((v) => v.name === venue);
  const visibleVenues = showAllVenues || activeInRest ? venues : topVenues;

  const visible = shows.filter(
    (s) =>
      (!venue || s.venue.trim() === venue) &&
      (!venueType || matchVenue(venueDirectory, s.venue)?.type === venueType),
  );

  if (shows.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm leading-relaxed text-[#E8E0D0]/60">
          No upcoming shows yet. Add your band and list your shows.
        </p>
        <Link
          href="/submit"
          className="mt-6 inline-block rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          Add your band →
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Venue-type filter — only worth showing with more than one type present. */}
      {venueTypeCounts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChip
            label="All types"
            count={shows.length}
            active={venueType === ""}
            onClick={() => setVenueType("")}
          />
          {venueTypeCounts.map(({ type, count }) => (
            <FilterChip
              key={type}
              label={type}
              count={count}
              active={venueType === type}
              onClick={() => setVenueType(type)}
            />
          ))}
        </div>
      )}

      {/* Venue filter — only worth showing with more than one venue. */}
      {venues.length > 1 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <FilterChip
            label="All venues"
            count={shows.length}
            active={venue === ""}
            onClick={() => setVenue("")}
          />
          {visibleVenues.map((v) => (
            <FilterChip
              key={v.name}
              label={v.name}
              count={v.count}
              active={venue === v.name}
              onClick={() => setVenue(v.name)}
            />
          ))}
          {restVenues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllVenues((s) => !s)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#E8E0D0]/50 underline decoration-dotted underline-offset-4 transition hover:text-[#E8E0D0]/80"
            >
              {showAllVenues ? "Show fewer venues" : `+${restVenues.length} more`}
            </button>
          )}
        </div>
      )}

      <ShowsTimeline
        shows={visible}
        emptyMessage={venue ? `No upcoming shows at ${venue}.` : "No upcoming shows."}
      />
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-[#E8E0D0] text-[#2A2420]"
          : "border border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
      }`}
    >
      {label} <span className={active ? "opacity-60" : "opacity-50"}>{count}</span>
    </button>
  );
}
