"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Show } from "@/lib/fetchShows";
import { matchVenue, type Venue } from "@/lib/venueUtils";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import ShowsTimeline from "@/components/ShowsTimeline";
import { iconProps } from "@/components/band-shared";

// Canonical display name for a show's venue, falling back to the raw scraped
// string when it doesn't resolve to an entry in the venue directory.
function venueName(directory: Venue[], s: Show): string {
  return matchVenue(directory, s.venue)?.name ?? s.venue.trim();
}

/** Labeled group inside the filter panel. Mirrors BandGrid's FilterSection. */
function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#E8E0D0]/40">
        {label}
      </h3>
      {children}
    </div>
  );
}

/** Removable chip representing one currently-active filter. Mirrors BandGrid. */
function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D0]/30 bg-[#E8E0D0]/10 px-2.5 py-1 text-xs text-[#E8E0D0]/85 transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/15"
    >
      {label}
      {/* ti-x (Tabler) */}
      <svg {...iconProps} width={12} height={12}>
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  );
}

const filterPillBase =
  "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

/** Toggle pill for a filter option, optionally with a trailing count. */
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${filterPillBase} ${
        active
          ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
          : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
      }`}
    >
      {label}
      {count != null && (
        <span className={active ? "opacity-60" : "opacity-50"}> {count}</span>
      )}
    </button>
  );
}

export default function ShowsList({
  shows,
  pastShows = [],
  venues: venueDirectory,
  press = [],
  today,
  statuses = {},
  loggedIn = false,
  intro,
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
  /** Primary CTA, rendered beside the search/filters column — mirrors
   * BandGrid's `intro` prop. */
  intro?: ReactNode;
}) {
  const [view, setView] = useState<"upcoming" | "recent">("upcoming");
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState<string>("");
  const [venueType, setVenueType] = useState<string>("");
  const [localBandsOnly, setLocalBandsOnly] = useState(false);
  const [pressRecommendedOnly, setPressRecommendedOnly] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  // The full filter set is collapsed behind a "Filters" button by default,
  // same as BandGrid.
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseShows.filter((s) => {
      if (venue && venueName(venueDirectory, s) !== venue) return false;
      if (venueType && matchVenue(venueDirectory, s.venue)?.type !== venueType) {
        return false;
      }
      if (localBandsOnly && s.bandSlugs.length === 0) return false;
      if (pressRecommendedOnly && s.starredBy.length === 0) return false;

      // Search across title, lineup, and venue name.
      if (q) {
        const haystack = [s.title, s.lineup, venueName(venueDirectory, s)]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    baseShows,
    venue,
    venueType,
    localBandsOnly,
    pressRecommendedOnly,
    query,
    venueDirectory,
  ]);

  const activeFilterCount =
    (venue ? 1 : 0) +
    (venueType ? 1 : 0) +
    (localBandsOnly ? 1 : 0) +
    (pressRecommendedOnly ? 1 : 0) +
    (showAllEvents ? 1 : 0);

  function clearAllFilters() {
    setVenue("");
    setVenueType("");
    setLocalBandsOnly(false);
    setPressRecommendedOnly(false);
    setShowAllEvents(false);
  }

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
      {/* Controls on the left, the intro/CTA stacked in a column on the right
          so the timeline isn't pushed down the page. Stacks on narrow
          screens. Mirrors BandGrid's layout. */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
      <div className="space-y-3">
        {/* Search + filters toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, venue, or lineup…"
            className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm transition ${
              filtersOpen
                ? "border-[#E8E0D0]/70 bg-[#E8E0D0]/10"
                : "border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/10"
            }`}
          >
            {/* ti-adjustments-horizontal (Tabler) */}
            <svg {...iconProps} width={16} height={16}>
              <path d="M4 6l8 0" />
              <path d="M16 6l4 0" />
              <path d="M4 12l2 0" />
              <path d="M10 12l10 0" />
              <path d="M4 18l11 0" />
              <path d="M18 18l2 0" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="8" cy="12" r="2" />
              <circle cx="16" cy="18" r="2" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#E8E0D0] px-1 text-[10px] font-semibold text-[#2A2420]">
                {activeFilterCount}
              </span>
            )}
            {/* ti-chevron-down (Tabler) */}
            <svg
              {...iconProps}
              width={14}
              height={14}
              className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6l6 -6" />
            </svg>
          </button>
        </div>

        {/* Active filters — always visible, even with the panel collapsed */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {venue && (
              <ActiveFilterChip label={venue} onRemove={() => setVenue("")} />
            )}
            {venueType && (
              <ActiveFilterChip label={venueType} onRemove={() => setVenueType("")} />
            )}
            {localBandsOnly && (
              <ActiveFilterChip
                label="Local bands"
                onRemove={() => setLocalBandsOnly(false)}
              />
            )}
            {pressRecommendedOnly && (
              <ActiveFilterChip
                label="Recommended by local press"
                onRemove={() => setPressRecommendedOnly(false)}
              />
            )}
            {showAllEvents && (
              <ActiveFilterChip
                label="Showing all events"
                onRemove={() => setShowAllEvents(false)}
              />
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2 py-1 text-xs text-[#E8E0D0]/50 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Full filter panel — collapsed by default, opened via the Filters button */}
        {filtersOpen && (
          <div className="space-y-4 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
            {/* Venue — only worth showing with more than one venue. */}
            {venues.length > 1 && (
              <FilterSection label="Venue">
                <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  <FilterPill
                    label="All venues"
                    active={venue === ""}
                    onClick={() => setVenue("")}
                  />
                  {venues.map(({ name, count }) => (
                    <FilterPill
                      key={name}
                      label={name}
                      count={count}
                      active={venue === name}
                      onClick={() => setVenue((v) => (v === name ? "" : name))}
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Venue type — only worth showing with more than one type present. */}
            {venueTypeCounts.length > 1 && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Venue type">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FilterPill
                      label="All types"
                      active={venueType === ""}
                      onClick={() => setVenueType("")}
                    />
                    {venueTypeCounts.map(({ type, count }) => (
                      <FilterPill
                        key={type}
                        label={type}
                        count={count}
                        active={venueType === type}
                        onClick={() =>
                          setVenueType((t) => (t === type ? "" : type))
                        }
                      />
                    ))}
                  </div>
                </FilterSection>
              </>
            )}

            {/* Local bands / press-recommended / show-all-events toggles —
                only worth showing when some shows qualify. */}
            {(localBandsCount > 0 || pressRecommendedCount > 0 || nonBandEventsCount > 0) && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Attributes">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {localBandsCount > 0 && (
                      <FilterPill
                        label="Local bands"
                        count={localBandsCount}
                        active={localBandsOnly}
                        onClick={() => setLocalBandsOnly((v) => !v)}
                      />
                    )}
                    {pressRecommendedCount > 0 && (
                      <FilterPill
                        label="Recommended by local press"
                        count={pressRecommendedCount}
                        active={pressRecommendedOnly}
                        onClick={() => setPressRecommendedOnly((v) => !v)}
                      />
                    )}
                    {nonBandEventsCount > 0 && (
                      <FilterPill
                        label="Show all events"
                        count={nonBandEventsCount}
                        active={showAllEvents}
                        onClick={() => setShowAllEvents((v) => !v)}
                      />
                    )}
                  </div>
                </FilterSection>
              </>
            )}

            <div className="flex justify-end border-t border-[#E8E0D0]/10 pt-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs transition hover:bg-[#E8E0D0]/10"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upcoming/Recent tab — Recent only worth showing once there's
          something in the last 30 days to look back at. Lets a past show
          stay reachable (to mark "I went to this") after fetchShows() drops
          it from the upcoming list. Positioned like BandGrid's Sort/View row. */}
      {pastShows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#E8E0D0]/45">Showing</span>
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
                onClick={() => setView("recent")}
                aria-pressed={view === "recent"}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  view === "recent"
                    ? "bg-[#E8E0D0] text-[#2A2420]"
                    : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
                }`}
              >
                Recent ({pastShows.length})
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

        {intro && (
          <aside className="shrink-0">{intro}</aside>
        )}
      </div>

      <p className="mb-4 mt-4 text-center text-xs text-[#E8E0D0]/55">
        Showing {visible.length} of {baseShows.length} shows
      </p>

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
