"use client";

// Date-grouped list of show cards — the "results" portion of ShowsList.tsx,
// extracted so it can also render a single venue's upcoming shows on its
// profile page without the venue/type filter chrome.

import Link from "next/link";
import type { Show } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import { pressNotes } from "@/lib/press";
import { venueFallbackImage, isVenueLogo } from "@/lib/venueImages";
import { ShowStatusButtons } from "@/components/ShowStatusButtons";

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

export default function ShowsTimeline({
  shows,
  press = [],
  emptyMessage = "No upcoming shows.",
  today,
  statuses = {},
  loggedIn = false,
  returnTo = "/shows",
  columns = 1,
}: {
  shows: Show[];
  press?: Press[];
  emptyMessage?: string;
  /** "YYYY-MM-DD" in America/Chicago — a show dated before this is past. Plain
   * string comparison works since dates are already ISO-ordered. */
  today: string;
  /** Logged-in user's attendance status per show id, from listShowStatuses. */
  statuses?: Record<string, ShowStatus>;
  loggedIn?: boolean;
  /** Where a logged-out attendance click's /login redirects back to. */
  returnTo?: string;
  /** Cards per row on wide screens. Only opt into 2 in a full-width container —
   * in a narrow column (e.g. a venue profile) the cards get too cramped. */
  columns?: 1 | 2;
}) {
  const groups = groupByDate(shows);

  if (groups.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.date}>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            {formatDateLabel(group.date)}
          </h2>
          <ul
            className={
              columns === 2
                ? "grid gap-3 lg:grid-cols-2"
                : "space-y-3"
            }
          >
            {group.shows.map((show, i) => {
              // Scraped flyer if we have one; otherwise fall back to the venue's
              // logo for venues that never publish flyers (e.g. Acadia). The
              // logo can also arrive as flyer_url straight from the DB, so key
              // the "logo vs poster" styling off isVenueLogo, not on which
              // source it came from.
              const imageSrc = show.flyerUrl || venueFallbackImage(show.venue);
              const isLogo = isVenueLogo(imageSrc);
              return (
              <li
                key={`${show.title}-${show.venue}-${i}`}
                className={`rounded-md border p-4 ${
                  show.starredBy.length > 0
                    ? "border-amber-400/40 bg-amber-400/[0.06]"
                    : "border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 items-start gap-3">
                    {imageSrc && (() => {
                      // Posters are cropped to fill; a venue logo is padded and
                      // contained so it isn't cut off.
                      const img = (
                        // eslint-disable-next-line @next/next/no-img-element -- external flyer art / local venue logo
                        <img
                          src={imageSrc}
                          alt=""
                          loading="lazy"
                          className={`h-20 w-20 rounded-md border border-[#E8E0D0]/15 ${
                            isLogo
                              ? "bg-[rgba(232,224,208,0.06)] object-contain p-1.5"
                              : "object-cover"
                          }`}
                        />
                      );
                      return show.id ? (
                        <Link
                          href={`/shows/${show.id}`}
                          className="shrink-0"
                          aria-label={show.title}
                        >
                          {img}
                        </Link>
                      ) : (
                        <span className="shrink-0">{img}</span>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="font-medium text-[#E8E0D0]">
                        {show.id ? (
                          <Link href={`/shows/${show.id}`} className="hover:underline">
                            {show.title}
                          </Link>
                        ) : (
                          show.title
                        )}
                        {show.starredBy.length > 0 && (
                          <span className="ml-1.5 text-amber-400">★</span>
                        )}
                        {show.eventType && (
                          <span className="ml-2 rounded bg-[#E8B84B]/15 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-[#E8B84B]">
                            {show.eventType}
                          </span>
                        )}
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
                      {pressNotes(show.starredBy, show.starredNotes, press).map(
                        (note) => (
                          <div key={note.id} className="mt-2">
                            <p className="text-xs font-medium text-amber-400">
                              ★ Recommended by{" "}
                              {note.url ? (
                                <a
                                  href={ensureUrl(note.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-amber-400/50 underline-offset-2 hover:text-amber-300"
                                >
                                  {note.name}
                                </a>
                              ) : (
                                note.name
                              )}
                            </p>
                            {note.blurb && (
                              <p className="mt-0.5 text-xs leading-relaxed text-[#E8E0D0]/60">
                                {note.blurb}
                              </p>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {show.id && (
                      <ShowStatusButtons
                        showId={show.id}
                        isPast={show.date < today}
                        initialStatus={statuses[show.id] ?? null}
                        loggedIn={loggedIn}
                        returnTo={returnTo}
                      />
                    )}
                    <div className="flex items-center gap-3">
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
                </div>
              </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
