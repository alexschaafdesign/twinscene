"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Show } from "@/lib/fetchShows";
import { matchVenue, type Venue } from "@/lib/fetchVenues";
import type { Press } from "@/lib/fetchPress";
import ShowsTimeline from "@/components/ShowsTimeline";

export default function ShowsList({
  shows,
  venues: venueDirectory,
  press = [],
}: {
  shows: Show[];
  venues: Venue[];
  press?: Press[];
}) {
  const [venue, setVenue] = useState<string>("");
  const [venueType, setVenueType] = useState<string>("");
  const [localBandsOnly, setLocalBandsOnly] = useState(false);
  const [pressRecommendedOnly, setPressRecommendedOnly] = useState(false);

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

  // Shows with at least one band linked to the directory.
  const localBandsCount = useMemo(
    () => shows.filter((s) => s.bandSlugs.length > 0).length,
    [shows],
  );

  // Shows starred by at least one Press outlet.
  const pressRecommendedCount = useMemo(
    () => shows.filter((s) => s.starredBy.length > 0).length,
    [shows],
  );

  const visible = shows.filter(
    (s) =>
      (!venue || s.venue.trim() === venue) &&
      (!venueType || matchVenue(venueDirectory, s.venue)?.type === venueType) &&
      (!localBandsOnly || s.bandSlugs.length > 0) &&
      (!pressRecommendedOnly || s.starredBy.length > 0),
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
      {/* Local bands / press-recommended toggles — only worth showing when
          some shows qualify. */}
      {(localBandsCount > 0 || pressRecommendedCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {localBandsCount > 0 && (
            <FilterChip
              label="Local bands"
              count={localBandsCount}
              active={localBandsOnly}
              onClick={() => setLocalBandsOnly((v) => !v)}
            />
          )}
          {pressRecommendedCount > 0 && (
            <FilterChip
              label="Recommended by local press"
              count={pressRecommendedCount}
              active={pressRecommendedOnly}
              onClick={() => setPressRecommendedOnly((v) => !v)}
            />
          )}
        </div>
      )}

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
        <div className="mb-8">
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="rounded-md border border-[#E8E0D0]/25 bg-[#2A2420] px-3 py-1.5 text-sm font-medium text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 focus:border-[#E8E0D0]/50 focus:outline-none"
          >
            <option value="">All venues ({shows.length} shows)</option>
            {venues.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.count} shows)
              </option>
            ))}
          </select>
        </div>
      )}

      <ShowsTimeline
        shows={visible}
        press={press}
        emptyMessage={
          venue
            ? `No upcoming shows at ${venue}.`
            : pressRecommendedOnly
              ? "No upcoming shows recommended by local press."
              : localBandsOnly
                ? "No upcoming shows with local bands."
                : "No upcoming shows."
        }
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
