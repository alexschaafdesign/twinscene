"use client";

// Date-grouped list of show cards — the "results" portion of ShowsList.tsx,
// extracted so it can also render a single venue's upcoming shows on its
// profile page without the venue/type filter chrome.
//
// Two render densities:
//  - "comfortable" (default, and what the band/venue profiles use): the classic
//    full card — flyer thumb, subtitle, genres, notes, press blurbs.
//  - "compact": a scannable agenda — each day's shows clustered by venue into a
//    block, every show a one-line row led by its start time. Used by the /shows
//    page, where the point is to see "what's on in town tonight" at a glance.
// Both share the new relative, sticky day headers ("Tonight" / "Tomorrow" /
// weekday + count) so you always know which day you're scrolling through.

import Link from "next/link";
import type { Show } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";
import type { ShowStatus } from "@/lib/showSaves";
import { pressNotes } from "@/lib/press";
import { showHeading, showSubtitle, splitSimilarTo } from "@/lib/showDisplay";
import { showTimeLabel, showStartTime } from "@/lib/showTime";
import { formatMiles } from "@/lib/distance";
import { isVenueLogo } from "@/lib/venueImages";
import { matchVenue, type Venue } from "@/lib/venueUtils";
import { autoInitials } from "@/lib/venueColor";
import VenueAvatar from "@/components/VenueAvatar";
import { ShowStatusButtons } from "@/components/ShowStatusButtons";
import { iconProps } from "@/components/band-shared";

/** Fixed thumbnail size (px) for a comfortable card's artwork — matches the
 * h-20/w-20 flyer thumb, so the venue-avatar and initials fallbacks line up. */
const THUMB_PX = 80;
/** Larger flyer for the roomy "cards" density. */
const CARD_THUMB = 128;

// "cards" = big detail-rich per-show cards; "compact" = venue-grouped blocks
// with flyer/venue avatars; "list" = an ultra-compact flat list, no artwork.
type Density = "cards" | "compact" | "list";

/** Fallback thumbnail for a flyer-less show whose venue isn't in the directory
 * yet (no page to borrow an avatar from): a neutral tile with the venue's
 * initials, so the card still has artwork without implying a venue profile. */
function GenericVenueThumb({ venue, size = THUMB_PX }: { venue: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.06)]"
      style={{ width: size, height: size }}
    >
      <span
        className="select-none font-mono font-semibold text-[#E8E0D0]/55"
        style={{ fontSize: Math.round(size * 0.3) }}
      >
        {autoInitials(venue)}
      </span>
    </div>
  );
}

/** Build the /shows/submit edit link, round-tripping the show's fields. */
function editHref(show: Show): string {
  const params = new URLSearchParams({
    edit: show.id,
    date: show.date,
    venue: show.venue,
    // Prefill only the editorial subtitle, not the band list, into the form's
    // "Event title" field.
    title: showSubtitle(show),
    lineup: show.lineup,
    notes: show.notes,
    link: show.link,
    musicTime: show.musicTime,
    doorsTime: show.doorsTime,
    genres: show.genres.join(", "),
    ageRestriction: show.ageRestriction,
    bandSlugs: show.bandSlugs.join(","),
  });
  return `/shows/submit?${params.toString()}`;
}

/**
 * A day header's relative label + a short absolute date. "Tonight" / "Tomorrow"
 * / "Yesterday" for the adjacent days, otherwise the weekday ("Saturday"), each
 * paired with e.g. "Sat, Jul 22". Parsed and compared in UTC so a "2026-07-15"
 * string never shifts a day across the viewer's timezone.
 */
function dayInfo(date: string, today: string): { label: string; sub: string } {
  const parse = (s: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const d = parse(date);
  const t = parse(today);
  if (Number.isNaN(d)) return { label: date, sub: "" };
  const sub = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(d));
  if (Number.isNaN(t)) return { label: sub, sub: "" };
  const diff = Math.round((d - t) / 86_400_000);
  let label: string;
  if (diff === 0) label = "Tonight";
  else if (diff === 1) label = "Tomorrow";
  else if (diff === -1) label = "Yesterday";
  else
    label = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(d));
  return { label, sub };
}

/** Split a "7:00pm" / "9:30pm" display time into a compact number + meridian
 * ("7pm" -> {num:"7", mer:"pm"}, "9:30pm" -> {num:"9:30", mer:"pm"}) for the
 * agenda's left time column; null when the string isn't a recognized time. */
function compactTime(raw: string): { num: string; mer: string } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m$/i.exec(raw.trim());
  if (!m) return null;
  const min = m[2] && m[2] !== "00" ? `:${m[2]}` : "";
  return { num: `${Number(m[1])}${min}`, mer: `${m[3].toLowerCase()}m` };
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

type VenueGroup = { key: string; name: string; venue?: Venue; shows: Show[] };

/** Cluster a day's shows by resolved venue, preserving each venue's first-seen
 * position so the caller's sort (soonest / nearest) still drives block order,
 * while a venue's multiple shows collapse under one heading. */
function groupByVenue(shows: Show[], venues: Venue[]): VenueGroup[] {
  const order: string[] = [];
  const map = new Map<string, VenueGroup>();
  for (const s of shows) {
    const v = s.venue ? matchVenue(venues, s.venue) : undefined;
    const name = (v?.name ?? s.venue).trim();
    const key = name.toLowerCase() || "—";
    let g = map.get(key);
    if (!g) {
      g = { key, name: name || "Venue TBA", venue: v, shows: [] };
      map.set(key, g);
      order.push(key);
    }
    g.shows.push(s);
  }
  return order.map((k) => map.get(k)!);
}

/** The scene / press badges that trail a show's heading, shared by both views. */
function ShowBadges({ show }: { show: Show }) {
  // "Scene bands" only when a LOCAL band is on the bill (migration 0059).
  // A show whose matched bands are all touring gets the muted "Touring" badge
  // instead — still visibly in the directory, just not flagged as the scene.
  // Fall back to bandSlugs (all-local) when localBandSlugs is absent — a Show
  // served from a pre-0059 persisted cache entry won't carry the new field.
  const localBandSlugs = show.localBandSlugs ?? show.bandSlugs;
  const isScene = localBandSlugs.length > 0;
  const isTouringOnly = !isScene && show.bandSlugs.length > 0;
  return (
    <>
      {show.starredBy.length > 0 && <span className="ml-1.5 text-amber-400">★</span>}
      {isScene && (
        <span className="ml-2 rounded bg-violet-400/15 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-violet-300">
          Scene bands
        </span>
      )}
      {isTouringOnly && (
        <span className="ml-2 rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          Touring
        </span>
      )}
      {show.eventType && (
        <span className="ml-2 rounded bg-[#E8B84B]/15 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-[#E8B84B]">
          {show.eventType}
        </span>
      )}
    </>
  );
}

/** Resolve a show's artwork: a real scraped poster → the venue's directory
 * avatar (venues with a page) → a generic initials tile. Used by both views. */
function ShowThumb({
  show,
  venues,
  size,
}: {
  show: Show;
  venues: Venue[];
  size: number;
}) {
  const imageSrc =
    show.flyerUrl && !isVenueLogo(show.flyerUrl) ? show.flyerUrl : "";
  const fallbackVenue =
    !imageSrc && show.venue ? matchVenue(venues, show.venue) : undefined;
  if (imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external flyer art
      <img
        src={imageSrc}
        alt=""
        loading="lazy"
        style={{ width: size, height: size }}
        className="rounded-md border border-[#E8E0D0]/15 object-cover"
      />
    );
  }
  if (fallbackVenue) {
    return (
      <VenueAvatar
        slug={fallbackVenue.slug}
        initials={fallbackVenue.avatarInitials || autoInitials(fallbackVenue.name)}
        size={size}
        className="rounded-md border border-[#E8E0D0]/15"
      />
    );
  }
  return <GenericVenueThumb venue={show.venue} size={size} />;
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
  density = "cards",
  distances,
  venues = [],
}: {
  shows: Show[];
  press?: Press[];
  /** Venue directory, used to give a flyer-less show a fallback thumbnail: the
   * matching venue's avatar when it has a page, else a generic initials tile.
   * Omit (default []) to skip venue-avatar fallbacks entirely. */
  venues?: Venue[];
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
  /** "cards" (default) = big detail-rich per-show cards; "compact" clusters
   * each day's shows by venue into a scannable agenda; "list" = a flat,
   * one-line-per-show list with no artwork. */
  density?: Density;
  /** Miles from the viewer's home to each show's venue, keyed by show id, when
   * sorting by distance. Present only in "nearest" mode; a null entry means the
   * venue has no coordinates, so no chip is shown. */
  distances?: Record<string, number | null>;
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
    <div className="space-y-8">
      {groups.map((group) => {
        const { label, sub } = dayInfo(group.date, today);
        return (
          <section key={group.date}>
            {/* Sticky relative day header — stays pinned while you scroll that
                day's shows, so you never lose the date context. */}
            <div className="sticky top-0 z-20 mb-3 flex items-baseline justify-between gap-3 bg-[#090909]/85 py-2 backdrop-blur">
              <h2 className="flex items-baseline gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]">
                  {label}
                </span>
                {sub && <span className="text-xs text-[#E8E0D0]/45">{sub}</span>}
              </h2>
              <span className="shrink-0 text-xs text-[#E8E0D0]/40">
                {group.shows.length} {group.shows.length === 1 ? "show" : "shows"}
              </span>
            </div>

            {density === "compact" ? (
              // Multi-column (masonry-style) flow rather than a grid: a grid
              // aligns rows, so a short block leaves a gap waiting for the tall
              // block beside it. Multicol lets each column pack independently.
              // Blocks carry their own mb-3 + break-inside-avoid (they must not
              // split across a column boundary).
              <ul className={columns === 2 ? "gap-3 lg:columns-2" : "space-y-3"}>
                {groupByVenue(group.shows, venues).map((vg) => (
                  <VenueBlock
                    key={vg.key}
                    group={vg}
                    today={today}
                    statuses={statuses}
                    loggedIn={loggedIn}
                    returnTo={returnTo}
                    distances={distances}
                  />
                ))}
              </ul>
            ) : density === "list" ? (
              // Ultra-compact: a flat, one-line-per-show list, no artwork —
              // just time · lineup · venue, time-sorted within the day.
              <ul className="divide-y divide-[#E8E0D0]/[0.07] overflow-hidden rounded-lg border border-[#E8E0D0]/10">
                {group.shows.map((show, i) => (
                  <UltraRow
                    key={`${show.id || show.title}-${i}`}
                    show={show}
                    today={today}
                    statuses={statuses}
                    loggedIn={loggedIn}
                    returnTo={returnTo}
                    distances={distances}
                  />
                ))}
              </ul>
            ) : (
              // "cards" — big, detail-rich, one card per row (single column).
              <ul className="space-y-4">
                {group.shows.map((show, i) => (
                  <ComfortableCard
                    key={`${show.title}-${show.venue}-${i}`}
                    show={show}
                    venues={venues}
                    press={press}
                    today={today}
                    statuses={statuses}
                    loggedIn={loggedIn}
                    returnTo={returnTo}
                    distances={distances}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The artwork for a venue block's left column: the venue's textured avatar
 * (its identity, since the venue name no longer appears as text), else a
 * generic initials tile — stretched to fill the (relative) column. */
function VenueBlockArt({ group }: { group: VenueGroup }) {
  if (group.venue) {
    return (
      <VenueAvatar
        slug={group.venue.slug}
        initials={group.venue.avatarInitials || autoInitials(group.venue.name)}
        fill
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[rgba(232,224,208,0.06)]">
      <span className="select-none font-mono text-lg font-semibold text-[#E8E0D0]/55">
        {autoInitials(group.name)}
      </span>
    </div>
  );
}

/** One venue's shows for a day, in the compact agenda: a full-height venue
 * avatar down the left, then the venue name (with distance) and each show as a
 * time-led row on the right. */
function VenueBlock({
  group,
  today,
  statuses,
  loggedIn,
  returnTo,
  distances,
}: {
  group: VenueGroup;
  today: string;
  statuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  returnTo: string;
  distances?: Record<string, number | null>;
}) {
  // Same venue ⇒ same distance; read it off the first show.
  const miles = distances?.[group.shows[0].id];
  // The art is the venue's avatar (its identity, now that the name no longer
  // appears as text). A single-show block links the avatar to that show, so
  // the whole card points at one show page; a multi-show block's avatar isn't
  // a link (each row still links to its own show). No venue-page link here.
  const single = group.shows.length === 1 ? group.shows[0] : null;
  const artHref = single?.id ? `/shows/${single.id}` : null;
  // A fixed square tile, top-aligned — keeps every block's avatar the same
  // dimensions.
  const artClass =
    "relative h-20 w-20 shrink-0 self-start overflow-hidden rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.06)]";

  return (
    <li className="mb-3 flex break-inside-avoid gap-3 rounded-lg border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.03)] p-3">
      {artHref ? (
        <Link href={artHref} className={artClass} aria-label={group.name}>
          <VenueBlockArt group={group} />
        </Link>
      ) : (
        <div className={artClass} aria-label={group.name}>
          <VenueBlockArt group={group} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-1.5 text-[11px] font-medium uppercase tracking-wide text-[#E8E0D0]/45 wrap-anywhere">
          {group.name}
          {miles != null && (
            <span className="rounded-full bg-[#9FD3A0]/15 px-1.5 py-0.5 text-[10px] font-medium normal-case text-[#9FD3A0]">
              {formatMiles(miles)}
            </span>
          )}
        </p>

        <ul className="space-y-0.5">
          {group.shows.map((show, i) => (
            <CompactRow
              key={`${show.id || show.title}-${i}`}
              show={show}
              today={today}
              statuses={statuses}
              loggedIn={loggedIn}
              returnTo={returnTo}
            />
          ))}
        </ul>
      </div>
    </li>
  );
}

/** One show as a single time-led row inside a venue block. */
function CompactRow({
  show,
  today,
  statuses,
  loggedIn,
  returnTo,
}: {
  show: Show;
  today: string;
  statuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  returnTo: string;
}) {
  const isPress = show.starredBy.length > 0;
  const time = compactTime(showStartTime(show));
  return (
    <li
      className={`relative flex items-start gap-2.5 rounded-md py-1 pl-1 pr-1 ${
        isPress
          ? "border-l-2 border-amber-400/60 bg-amber-400/[0.05]"
          : "border-l-2 border-transparent"
      } ${show.id ? "transition hover:bg-[#E8E0D0]/[0.04]" : ""}`}
    >
      {/* Whole-row click target → the show detail page. Raised controls (the
          star) sit above it, so it never swallows their clicks. */}
      {show.id && (
        <Link
          href={`/shows/${show.id}`}
          aria-label={showHeading(show)}
          className="absolute inset-0 z-0"
        />
      )}
      {/* Band names lead as the primary text; the time follows on a small,
          muted line below (the status button stays top-aligned on the li). */}
      <div className="min-w-0 flex-1 wrap-anywhere">
        <p className="text-[15px] font-semibold leading-snug text-[#E8E0D0]">
          {showHeading(show)}
          <ShowBadges show={show} />
        </p>
        {showSubtitle(show) && (
          <p className="text-xs text-[#E8E0D0]/55">{showSubtitle(show)}</p>
        )}
        <p className="mt-0.5 text-xs tabular-nums text-[#E8E0D0]/50">
          {time ? (
            <>
              {time.num}
              <span className="ml-0.5">{time.mer}</span>
            </>
          ) : (
            <span className="uppercase tracking-wide text-[#E8E0D0]/30">TBA</span>
          )}
        </p>
      </div>
      {show.id && (
        <div className="relative z-10 shrink-0">
          <ShowStatusButtons
            showId={show.id}
            isPast={show.date < today}
            initialStatus={statuses[show.id] ?? null}
            loggedIn={loggedIn}
            returnTo={returnTo}
          />
        </div>
      )}
    </li>
  );
}

/** One show as a single flat list row for the ultra-compact density: no
 * artwork, just time · lineup · venue on one line, with the star toggle. */
function UltraRow({
  show,
  today,
  statuses,
  loggedIn,
  returnTo,
  distances,
}: {
  show: Show;
  today: string;
  statuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  returnTo: string;
  distances?: Record<string, number | null>;
}) {
  const isPress = show.starredBy.length > 0;
  const time = compactTime(showStartTime(show));
  const miles = show.id ? distances?.[show.id] : undefined;
  return (
    <li
      className={`relative flex items-start gap-3 px-3 py-1.5 ${
        isPress
          ? "border-l-2 border-amber-400/60 bg-amber-400/[0.04]"
          : "border-l-2 border-transparent"
      } ${show.id ? "transition hover:bg-[#E8E0D0]/[0.04]" : ""}`}
    >
      {/* Whole-row click target → the show detail page. Sits under the star
          control (which is raised above it) so the star still toggles. */}
      {show.id && (
        <Link
          href={`/shows/${show.id}`}
          aria-label={showHeading(show)}
          className="absolute inset-0 z-0"
        />
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <div className="w-12 shrink-0 text-right tabular-nums">
          {time ? (
            <span className="text-sm font-semibold text-[#E8E0D0]/90">
              {time.num}
              <span className="ml-0.5 text-[10px] font-normal text-[#E8E0D0]/50">
                {time.mer}
              </span>
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-[#E8E0D0]/30">
              TBA
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-sm leading-snug wrap-anywhere">
          <span className="font-medium text-[#E8E0D0]">{showHeading(show)}</span>
          <ShowBadges show={show} />
          {show.venue && (
            <span className="text-[#E8E0D0]/50">
              {" · "}
              {show.venue}
            </span>
          )}
          {miles != null && (
            <span className="ml-1.5 rounded-full bg-[#9FD3A0]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#9FD3A0]">
              {formatMiles(miles)}
            </span>
          )}
        </p>
      </div>
      {show.id && (
        <div className="relative z-10 shrink-0">
          <ShowStatusButtons
            showId={show.id}
            isPast={show.date < today}
            initialStatus={statuses[show.id] ?? null}
            loggedIn={loggedIn}
            returnTo={returnTo}
          />
        </div>
      )}
    </li>
  );
}

/** The classic full show card — flyer thumb, subtitle, genres, notes, press
 * blurbs. Used by the comfortable density and the band/venue profile lists. */
function ComfortableCard({
  show,
  venues,
  press,
  today,
  statuses,
  loggedIn,
  returnTo,
  distances,
}: {
  show: Show;
  venues: Venue[];
  press: Press[];
  today: string;
  statuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  returnTo: string;
  distances?: Record<string, number | null>;
}) {
  const isPressRecommended = show.starredBy.length > 0;
  return (
    <li
      className={`relative rounded-md border p-4 ${
        isPressRecommended
          ? "border-amber-400/40 bg-amber-400/[0.06]"
          : "border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)]"
      } ${show.id ? "transition hover:border-[#E8E0D0]/25" : ""}`}
    >
      {/* Whole-card click target → the show detail page. The star buttons and
          the edit pencil are raised above it so they stay independently
          clickable. */}
      {show.id && (
        <Link
          href={`/shows/${show.id}`}
          aria-label={showHeading(show)}
          className="absolute inset-0 z-0 rounded-md"
        />
      )}
      <div className="flex items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {(show.flyerUrl || show.venue) && (
            <span className="shrink-0">
              <ShowThumb show={show} venues={venues} size={CARD_THUMB} />
            </span>
          )}
          {/* wrap-anywhere lets long unbroken tokens break so the card can
              shrink to a phone's width. */}
          <div className="min-w-0 wrap-anywhere">
            <p className="text-base font-semibold leading-snug text-[#E8E0D0]">
              {showHeading(show)}
              <ShowBadges show={show} />
            </p>
            {showSubtitle(show) && (
              <p className="mt-0.5 text-sm text-[#E8E0D0]/70">{showSubtitle(show)}</p>
            )}
            {show.venue && (
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-[#E8E0D0]/75">
                <span>{show.venue}</span>
                {distances?.[show.id] != null && (
                  <span className="rounded-full bg-[#9FD3A0]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#9FD3A0]">
                    {formatMiles(distances[show.id]!)}
                  </span>
                )}
              </p>
            )}
            {showTimeLabel(show) && (
              <p className="mt-0.5 text-sm text-[#E8E0D0]/60">{showTimeLabel(show)}</p>
            )}
            {(show.genres.length > 0 || show.ageRestriction) && (
              <p className="mt-1 flex flex-wrap items-center gap-1">
                {show.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[11px] text-[#E8E0D0]/75"
                  >
                    {g}
                  </span>
                ))}
                {show.ageRestriction && (
                  <span className="rounded bg-[#E8B84B]/15 px-1.5 py-0.5 text-[11px] text-[#E8B84B]">
                    {show.ageRestriction}
                  </span>
                )}
              </p>
            )}
            {show.similarTo && (
              <div className="mt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#E8E0D0]/45">
                  For fans of
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  {splitSimilarTo(show.similarTo).map((name) => (
                    <span
                      key={name}
                      className="rounded-full border border-[#E8B84B]/35 px-2 py-0.5 text-xs text-[#E8B84B]/90"
                    >
                      {name}
                    </span>
                  ))}
                </p>
              </div>
            )}
            {show.notes && (
              <p className="mt-2 text-sm text-[#E8E0D0]/55">{show.notes}</p>
            )}
            {show.description && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/70">
                {show.description}
              </p>
            )}
            {pressNotes(show.starredBy, show.starredNotes, press).map((note) => (
              <div key={note.id} className="mt-2">
                <p className="text-xs font-medium text-amber-400">
                  ★ Recommended by {note.name}
                </p>
                {note.blurb && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[#E8E0D0]/60">
                    {note.blurb}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 flex-col items-end gap-2">
          {show.id && (
            <ShowStatusButtons
              showId={show.id}
              isPast={show.date < today}
              initialStatus={statuses[show.id] ?? null}
              loggedIn={loggedIn}
              returnTo={returnTo}
            />
          )}
        </div>
      </div>
      {show.id && (
        <Link
          href={editHref(show)}
          aria-label="Edit show"
          className="absolute bottom-2 right-2 z-10 text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]/80"
        >
          {/* ti-pencil (Tabler) */}
          <svg {...iconProps} width={15} height={15}>
            <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </Link>
      )}
    </li>
  );
}
