"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Show } from "@/lib/fetchShows";

/** Prefix a bare URL with https:// so hrefs from the sheet always resolve. */
function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Build the /shows/submit edit link, round-tripping the show's fields. */
function editHref(show: Show): string {
  const params = new URLSearchParams({
    edit: show.id,
    date: show.date,
    venue: show.venue,
    title: show.title,
    lineup: show.lineup,
    notes: show.notes,
    link: show.link,
    bandSlugs: show.bandSlugs.join(","),
  });
  return `/shows/submit?${params.toString()}`;
}

/**
 * Format an ISO "YYYY-MM-DD" date as e.g. "Saturday, July 12". Parsed and
 * formatted in UTC so a "2026-07-15" string never shifts a day across the
 * viewer's timezone. Unexpected formats fall back to the raw string.
 */
function formatDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Group already-date-sorted shows into consecutive same-date buckets. */
function groupByDate(shows: Show[]): { date: string; shows: Show[] }[] {
  const groups: { date: string; shows: Show[] }[] = [];
  for (const show of shows) {
    const last = groups[groups.length - 1];
    if (last && last.date === show.date) last.shows.push(show);
    else groups.push({ date: show.date, shows: [show] });
  }
  return groups;
}

// Number of venue chips to show before collapsing the rest under "Show more".
const VISIBLE_VENUE_COUNT = 8;

export default function ShowsList({ shows }: { shows: Show[] }) {
  const [venue, setVenue] = useState<string>("");
  const [showAllVenues, setShowAllVenues] = useState(false);

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

  const topVenues = venues.slice(0, VISIBLE_VENUE_COUNT);
  const restVenues = venues.slice(VISIBLE_VENUE_COUNT);
  // Keep the active venue's chip visible even if it's outside the top N.
  const activeInRest = restVenues.some((v) => v.name === venue);
  const visibleVenues = showAllVenues || activeInRest ? venues : topVenues;

  const visible = venue ? shows.filter((s) => s.venue.trim() === venue) : shows;
  const groups = groupByDate(visible);

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

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
          No upcoming shows at {venue}.
        </p>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
                {formatDateLabel(group.date)}
              </h2>
              <ul className="space-y-3">
                {group.shows.map((show, i) => (
                  <li
                    key={`${show.title}-${show.venue}-${i}`}
                    className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="flex min-w-0 items-start gap-3">
                        {show.flyerUrl && (
                          <a
                            href={ensureUrl(show.flyerUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                            aria-label={`${show.title} flyer`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- external flyer art */}
                            <img
                              src={show.flyerUrl}
                              alt=""
                              loading="lazy"
                              className="h-20 w-20 rounded-md border border-[#E8E0D0]/15 object-cover"
                            />
                          </a>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-[#E8E0D0]">
                            {show.title}
                          </p>
                          {show.venue && (
                            <p className="mt-0.5 text-sm text-[#E8E0D0]/75">
                              {show.venue}
                            </p>
                          )}
                          {show.lineup && show.lineup !== show.title && (
                            <p className="mt-1 text-sm text-[#E8E0D0]/60">
                              {show.lineup}
                            </p>
                          )}
                          {show.notes && (
                            <p className="mt-1 text-sm text-[#E8E0D0]/50">
                              {show.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {show.link && (
                          <a
                            href={ensureUrl(show.link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10"
                          >
                            Tickets / Info →
                          </a>
                        )}
                        {show.id && (
                          <Link
                            href={editHref(show)}
                            className="text-xs text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]/80"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
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
