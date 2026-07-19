"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Show } from "@/lib/fetchShows";
import { matchVenue, type Venue } from "@/lib/venueUtils";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import ShowsTimeline from "@/components/ShowsTimeline";

// Canonical display name for a show's venue, falling back to the raw scraped
// string when it doesn't resolve to an entry in the venue directory.
function venueName(directory: Venue[], s: Show): string {
  return matchVenue(directory, s.venue)?.name ?? s.venue.trim();
}

export default function ShowsList({
  shows,
  pastShows = [],
  venues: venueDirectory,
  press = [],
  today,
  statuses = {},
  loggedIn = false,
}: {
  shows: Show[];
  /** Shows in the last N days (fetchPastShows) — the "Recent" tab, so a show
   * that's already happened is still reachable to mark "I went to this". */
  pastShows?: Show[];
  venues: Venue[];
  press?: Press[];
  /** "YYYY-MM-DD" in America/Chicago, for ShowsTimeline's upcoming/past split. */
  today: string;
  /** Logged-in user's attendance status per show id. */
  statuses?: Record<string, ShowStatus>;
  loggedIn?: boolean;
}) {
  const [view, setView] = useState<"upcoming" | "recent">("upcoming");
  const [venue, setVenue] = useState<string>("");
  const [venueType, setVenueType] = useState<string>("");
  const [localBandsOnly, setLocalBandsOnly] = useState(false);
  const [pressRecommendedOnly, setPressRecommendedOnly] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Everything below (filters, counts, the timeline itself) derives from
  // whichever tab is active, so switching to "Recent" re-scopes the whole
  // page to past shows instead of upcoming ones.
  const activeShows = view === "recent" ? pastShows : shows;

  // Shows tagged with a non-band event type (open mic, trivia, DJ night,
  // etc. — see the scrapers' classifyEventType helpers). Hidden by default;
  // the "Show all events" toggle below reveals them.
  const nonBandEventsCount = useMemo(
    () => activeShows.filter((s) => s.eventType).length,
    [activeShows],
  );

  // Everything downstream (venue/type filters, the other toggles, and the
  // final visible list) derives from this, so counts and dropdowns stay
  // consistent with what "Show all events" actually reveals.
  const baseShows = useMemo(
    () => (showAllEvents ? activeShows : activeShows.filter((s) => !s.eventType)),
    [activeShows, showAllEvents],
  );

  // Distinct venues (with counts), busiest first (ties broken alphabetically).
  // Resolved through matchVenue so scraper spellings (e.g. "Icehouse Mpls")
  // group under the canonical venue name ("Icehouse") instead of splitting
  // into a separate entry.
  const venues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of baseShows) {
      const v = venueName(venueDirectory, s);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [baseShows, venueDirectory]);

  // Distinct venue types (with counts) among upcoming shows, busiest first —
  // same derivation as `venues` above, since the vocabulary lives in the
  // sheet's TYPE column rather than a fixed list.
  const venueTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of baseShows) {
      const type = matchVenue(venueDirectory, s.venue)?.type;
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [baseShows, venueDirectory]);

  // Shows with at least one band linked to the directory.
  const localBandsCount = useMemo(
    () => baseShows.filter((s) => s.bandSlugs.length > 0).length,
    [baseShows],
  );

  // Shows starred by at least one Press outlet.
  const pressRecommendedCount = useMemo(
    () => baseShows.filter((s) => s.starredBy.length > 0).length,
    [baseShows],
  );

  const visible = baseShows.filter(
    (s) =>
      (!venue || venueName(venueDirectory, s) === venue) &&
      (!venueType || matchVenue(venueDirectory, s.venue)?.type === venueType) &&
      (!localBandsOnly || s.bandSlugs.length > 0) &&
      (!pressRecommendedOnly || s.starredBy.length > 0),
  );

  if (shows.length === 0 && pastShows.length === 0) {
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
      {/* Upcoming/Recent tab — Recent only worth showing once there's
          something in the last 30 days to look back at. Lets a past show
          stay reachable (to mark "I went to this") after fetchShows() drops
          it from the upcoming list. */}
      {pastShows.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <FilterChip
            label="Upcoming"
            count={shows.length}
            active={view === "upcoming"}
            onClick={() => setView("upcoming")}
          />
          <FilterChip
            label="Recent"
            count={pastShows.length}
            active={view === "recent"}
            onClick={() => setView("recent")}
          />
        </div>
      )}

      {/* Local bands / press-recommended / show-all-events toggles — only
          worth showing when some shows qualify. */}
      {(localBandsCount > 0 || pressRecommendedCount > 0 || nonBandEventsCount > 0) && (
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
          {nonBandEventsCount > 0 && (
            <FilterChip
              label="Show all events"
              count={nonBandEventsCount}
              active={showAllEvents}
              onClick={() => setShowAllEvents((v) => !v)}
            />
          )}
        </div>
      )}

      {/* Venue-type filter — only worth showing with more than one type present. */}
      {venueTypeCounts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChip
            label="All types"
            count={baseShows.length}
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
            <option value="">All venues ({baseShows.length} shows)</option>
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
        columns={2}
        press={press}
        today={today}
        statuses={statuses}
        loggedIn={loggedIn}
        returnTo="/shows"
        emptyMessage={
          view === "recent"
            ? venue
              ? `No recent shows at ${venue}.`
              : "No recent shows in the last 30 days."
            : venue
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
