import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { todayInChicago } from "@/lib/fetchShows";
import { getCachedShowById, getCachedBandsBySlugs, getCachedVenues } from "@/lib/cachedReads";
import { fetchPress } from "@/lib/fetchPress";
import { pressNotes } from "@/lib/press";
import { showHeading, showSubtitle, splitSimilarTo } from "@/lib/showDisplay";
import { showTimeLabel } from "@/lib/showTime";
import { isVenueLogo } from "@/lib/venueImages";
import { matchVenue } from "@/lib/venueUtils";
import { autoInitials } from "@/lib/venueColor";
import VenueAvatar from "@/components/VenueAvatar";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getShowStatus } from "@/lib/showSaves";
import { ShowStatusButtons } from "@/components/ShowStatusButtons";
import BackLink from "@/components/BackLink";

// Shared by generateMetadata and the page body so a visit costs one
// fetchShowById() DB hit, not two.
const getShow = cache(getCachedShowById);

export const dynamic = "force-dynamic";

/** Prefix a bare URL with https:// so hrefs always resolve. */
function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Build the /shows/submit edit link, round-tripping the show's fields — the
 * submit page reads these from the query string (it doesn't refetch by id).
 * Mirrors editHref in components/ShowsTimeline.tsx. */
function editHref(show: {
  id: string;
  date: string;
  venue: string;
  title: string;
  lineup: string;
  notes: string;
  link: string;
  musicTime: string;
  doorsTime: string;
  genres: string[];
  ageRestriction: string;
  bandSlugs: string[];
}): string {
  const params = new URLSearchParams({
    edit: show.id,
    date: show.date,
    venue: show.venue,
    // Prefill only the editorial subtitle into the form's "Event title" field,
    // not the band list.
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

/** "YYYY-MM-DD" → "Saturday, July 12", formatted in UTC so the day never shifts. */
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) return {};
  const description = [show.venue, show.lineup || undefined].filter(Boolean).join(" · ");
  return {
    title: `${showHeading(show)} — Twin Scene`,
    description: description || undefined,
  };
}

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const show = await getShow(id);
  if (!show) notFound();

  const user = await getCurrentUser();
  const [bands, press, venues, status] = await Promise.all([
    getCachedBandsBySlugs(show.bandSlugs),
    fetchPress(),
    getCachedVenues(),
    user ? getShowStatus(user.id, show.id) : Promise.resolve(null),
  ]);

  const bandBySlug = new Map(bands.map((b) => [b.slug, b]));
  const notes = pressNotes(show.starredBy, show.starredNotes, press);
  const ticketHref = show.link || show.flyerUrl;
  // A real scraped poster only. A stored venue-logo flyer_url (e.g. Acadia's)
  // falls through to the venue avatar, same as any flyer-less show.
  const imageSrc =
    show.flyerUrl && !isVenueLogo(show.flyerUrl) ? show.flyerUrl : "";
  const fallbackVenue =
    !imageSrc && show.venue ? matchVenue(venues, show.venue) : undefined;
  const isPast = show.date < todayInChicago();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/shows" label="Shows" className="mb-6" />

      <div className="flex flex-col gap-6 sm:flex-row">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- external flyer art
          <img
            src={imageSrc}
            alt={`${showHeading(show)} flyer`}
            className="aspect-square w-full rounded-md border border-[#E8E0D0]/15 object-cover sm:w-64"
          />
        ) : fallbackVenue ? (
          // Flyer-less show at a directory venue: its avatar, matching /venues.
          <VenueAvatar
            slug={fallbackVenue.slug}
            initials={fallbackVenue.avatarInitials || autoInitials(fallbackVenue.name)}
            className="w-full shrink-0 rounded-md border border-[#E8E0D0]/15 sm:w-64"
          />
        ) : show.venue ? (
          // Venue not in the directory yet: a generic initials tile.
          <div className="flex aspect-square w-full shrink-0 items-center justify-center rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.06)] sm:w-64">
            <span className="select-none font-mono text-5xl font-semibold text-[#E8E0D0]/55">
              {autoInitials(show.venue)}
            </span>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 text-2xl font-medium text-[#E8E0D0]">
              {showHeading(show)}
              {show.eventType && (
                <span className="ml-2 rounded bg-[#E8B84B]/15 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-[#E8B84B]">
                  {show.eventType}
                </span>
              )}
            </h1>
            {/* Star sits top-right of the show, matching the list rows so its
                position is consistent site-wide — and larger here so it reads
                as the primary "track this show" action. */}
            <div className="shrink-0">
              <ShowStatusButtons
                showId={show.id}
                isPast={isPast}
                initialStatus={status}
                loggedIn={!!user}
                returnTo={`/shows/${show.id}`}
                starSize={30}
              />
            </div>
          </div>
          {showSubtitle(show) && (
            <p className="mt-1 text-base text-[#E8E0D0]/75">{showSubtitle(show)}</p>
          )}
          <p className="mt-1 text-sm text-[#E8E0D0]/70">
            {formatDateLabel(show.date)}
            {show.venue && <> · {show.venue}</>}
          </p>
          {showTimeLabel(show) && (
            <p className="mt-1 text-sm text-[#E8E0D0]/60">{showTimeLabel(show)}</p>
          )}
          {(show.genres.length > 0 || show.ageRestriction) && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              {show.genres.map((g) => (
                <span
                  key={g}
                  className="rounded bg-[#E8E0D0]/10 px-2 py-0.5 text-xs text-[#E8E0D0]/80"
                >
                  {g}
                </span>
              ))}
              {show.ageRestriction && (
                <span className="rounded bg-[#E8B84B]/15 px-2 py-0.5 text-xs text-[#E8B84B]">
                  {show.ageRestriction}
                </span>
              )}
            </p>
          )}

          {show.similarTo && (
            <div className="mt-3">
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

          {notes.map((note) => (
            <p key={note.id} className="mt-2 text-sm text-amber-400/80">
              ★{" "}
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
              {note.blurb && <span className="text-amber-400/60"> — {note.blurb}</span>}
            </p>
          ))}

          {show.notes && <p className="mt-3 text-sm text-[#E8E0D0]/60">{show.notes}</p>}

          {ticketHref && (
            <div className="mt-5">
              <a
                href={ensureUrl(ticketHref)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
              >
                Tickets / info →
              </a>
            </div>
          )}

          {isAdmin(user) && (
            <Link
              href={editHref(show)}
              className="mt-4 inline-block text-sm text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]/80"
            >
              Edit show
            </Link>
          )}
        </div>
      </div>

      {show.description && (
        <div className="mt-8 max-w-2xl">
          <p className="whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/75">
            {show.description}
          </p>
        </div>
      )}

      {show.lineupEntries.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Lineup
          </h2>
          <ul className="space-y-5">
            {show.lineupEntries.map((entry, i) => {
              const band = entry.bandSlug ? bandBySlug.get(entry.bandSlug) : undefined;
              if (!band) {
                return (
                  <li key={`${entry.name}-${i}`} className="text-sm text-[#E8E0D0]">
                    {entry.name}
                  </li>
                );
              }
              const thumb = band.thumbnailUrl || band.image;
              return (
                <li key={band.slug}>
                  <Link href={`/bands/${band.slug}`} className="group flex gap-3">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element -- external band photo (images host)
                      <img
                        src={thumb}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#E8E0D0] group-hover:underline">
                        {band.name}
                      </p>
                      {band.genres.length > 0 && (
                        <p className="text-xs text-[#E8E0D0]/50">{band.genres.join(", ")}</p>
                      )}
                      {band.bio && (
                        <p className="mt-1 line-clamp-3 text-sm text-[#E8E0D0]/70">{band.bio}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
