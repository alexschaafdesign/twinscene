// Shared band profile content — the photo, name, location, genres, Bandcamp
// player, bio, upcoming shows, social links and preferred contact method.
//
// Full-width, two-column layout for the dedicated /bands/[slug] page: a left
// sidebar (photo, player, links, contact) and a wider main column (name, bio,
// shows). Items are placed explicitly per grid cell on md+, and fall back to a
// single readable column on mobile (photo → name → player → bio → shows →
// links → contact). The surrounding chrome (back / edit links) is supplied by
// the page, using `editHref` below.

import type { Band } from "@/lib/fetchBands";
import type { Show } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";
import type { VideoRow } from "@/lib/videos";
import { pressNotes } from "@/lib/press";
import BandcampPlayer from "@/components/BandcampPlayer";
import {
  IconLink,
  PlaceLine,
  ensureUrl,
  formatShowDate,
  iconProps,
} from "@/components/band-shared";
import { BandImage, CopyButton } from "@/components/band-shared-client";
import { parseYoutubeId } from "@/lib/youtube";

/** Prefilled "correct this band" submit URL — shown in the profile header. */
export function editHref(band: Band, videos: VideoRow[] = []): string {
  const params = new URLSearchParams({
    correct: "true",
    band: band.slug,
    name: band.name,
    genres: band.genres.join(", "),
    location: band.city, // the sheet's LOCATION column holds the city
    neighborhoods: band.neighborhoods.join(", "),
    members: band.members.join(", "),
    contactEmail: band.contactEmail,
    contactMethod: band.contactMethod,
    website: band.website,
    instagram: band.instagram,
    bandcamp: band.bandcamp,
    bio: band.bio,
    image: band.image,
    // Round-trip only url + label; the image is re-resolved server-side.
    featuredLinks: JSON.stringify(
      band.featuredLinks.map((l) => ({ url: l.url, label: l.label })),
    ),
    videos: JSON.stringify(
      videos.map((v) => ({ id: v.id, url: v.video_url, title: v.video_title })),
    ),
  });
  return `/submit?${params.toString()}`;
}

/** Bare hostname (no www.) for a link, used as a fallback label. */
function linkHost(url: string): string {
  try {
    return new URL(ensureUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Band-curated highlight links, shown as image cards (or text-only cards). */
function FeaturedLinks({ band }: { band: Band }) {
  if (band.featuredLinks.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Featured
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {band.featuredLinks.map((link, i) => (
          <a
            key={i}
            href={ensureUrl(link.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col overflow-hidden rounded-lg border border-[#E8E0D0]/15 transition hover:border-[#E8E0D0]/40"
          >
            {link.image ? (
              <div className="aspect-[16/10] w-full overflow-hidden bg-[#E8E0D0]/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={link.image}
                  alt=""
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center bg-[#E8E0D0]/5 text-[#E8E0D0]/25">
                {/* ti-link (Tabler) */}
                <svg {...iconProps} width={28} height={28}>
                  <path d="M9 15l6 -6" />
                  <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" />
                  <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />
                </svg>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-[#E8E0D0]/90 group-hover:text-[#E8E0D0]">
                {link.label || linkHost(link.url)}
              </span>
              {/* ti-external-link (Tabler) */}
              <svg
                {...iconProps}
                width={14}
                height={14}
                className="shrink-0 text-[#E8E0D0]/40"
              >
                <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
                <path d="M11 13l9 -9" />
                <path d="M15 4h5v5" />
              </svg>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Band's YouTube videos — scraper-matched (UnderCurrentMPLS backfill) and/or
 * hand-entered via the edit form. Each renders as a responsive embed with its
 * title as a caption. */
function BandVideos({ videos }: { videos: VideoRow[] }) {
  if (videos.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Videos from{" "}
        <a
          href="https://www.youtube.com/@UnderCurrentMPLS"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[#E8E0D0]/30 underline-offset-2 transition hover:text-[#E8E0D0]/85"
        >
          UnderCurrentMPLS
        </a>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {videos.map((video) => {
          const videoId = parseYoutubeId(video.video_url);
          if (!videoId) return null;
          return (
            <div key={video.id}>
              <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
                <iframe
                  title={video.video_title}
                  src={`https://www.youtube.com/embed/${videoId}`}
                  className="h-full w-full border-0"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="mt-1.5 truncate text-xs text-[#E8E0D0]/70">{video.video_title}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BandLinks({ band }: { band: Band }) {
  const hasAny = band.website || band.instagram || band.bandcamp;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-2.5">
      {band.website && (
        <IconLink href={ensureUrl(band.website)} label="Website">
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
          </svg>
        </IconLink>
      )}
      {band.instagram && (
        <IconLink
          href={`https://instagram.com/${band.instagram}`}
          label={`Instagram @${band.instagram}`}
        >
          <svg {...iconProps}>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
          </svg>
        </IconLink>
      )}
      {band.bandcamp && !band.bandcamp.includes("<iframe") && (
        <IconLink href={ensureUrl(band.bandcamp)} label="Bandcamp">
          <svg {...iconProps}>
            <path d="M4 16l5-8h11l-5 8z" />
          </svg>
        </IconLink>
      )}
    </div>
  );
}

/** Surface the band's preferred contact method. */
function ContactMethod({ band }: { band: Band }) {
  const usesInstagram = band.contactMethod === "instagram" && !!band.instagram;
  const usesEmail = band.contactMethod === "email" && !!band.contactEmail;
  const usesWebsite = band.contactMethod === "website" && !!band.website;

  let content;
  if (usesInstagram) {
    content = (
      <p className="text-sm text-[#E8E0D0]/85">
        <span className="text-[#E8E0D0]/55">Instagram DMs: </span>
        <a
          href={`https://instagram.com/${band.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          @{band.instagram}
        </a>
      </p>
    );
  } else if (usesEmail) {
    content = (
      <div className="flex items-center gap-2 text-sm text-[#E8E0D0]/85">
        <span className="text-[#E8E0D0]/55">Email:</span>
        <span className="select-all break-all">{band.contactEmail}</span>
        <CopyButton text={band.contactEmail} />
      </div>
    );
  } else if (usesWebsite) {
    content = (
      <p className="text-sm text-[#E8E0D0]/85">
        <span className="text-[#E8E0D0]/55">Website: </span>
        <a
          href={ensureUrl(band.website)}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          {band.website}
        </a>
      </p>
    );
  } else {
    content = <p className="text-sm italic text-[#E8E0D0]/45">Not set yet</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Preferred contact method
      </h2>
      {content}
    </div>
  );
}

export default function BandProfile({
  band,
  shows = [],
  press = [],
  videos = [],
}: {
  band: Band;
  shows?: Show[];
  press?: Press[];
  videos?: VideoRow[];
}) {
  const hasBandcamp = band.bandcampEmbedUrl || band.bandcamp;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      {/* Photo — sidebar, top */}
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        <BandImage band={band} className="rounded-md ring-1 ring-[#E8E0D0]/10" />
      </div>

      {/*
        Main content — spans both sidebar rows and stacks internally, so name →
        bio → player → shows flow tight from the top regardless of the photo's
        height (rather than each aligning to the photo's grid row).
      */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        <div>
          <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
            {band.name}
          </h1>
          <PlaceLine band={band} className="mt-2 text-sm" />
          {band.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {band.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bio — right below the name */}
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {band.bio || "No bio yet."}
        </p>

        {/* Members */}
        {band.members.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Members
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {band.members.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-[#E8E0D0]/10 px-2.5 py-0.5 text-xs text-[#E8E0D0]/80"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Featured links — band-curated highlights */}
        <FeaturedLinks band={band} />

        {/* Bandcamp player — right below the bio */}
        {hasBandcamp && (
          <BandcampPlayer
            name={band.name}
            bandcamp={band.bandcamp}
            bandcampEmbedUrl={band.bandcampEmbedUrl}
            bandcampEmbedHeight={band.bandcampEmbedHeight}
          />
        )}

        {/* Videos */}
        <BandVideos videos={videos} />

        {/* Upcoming shows */}
        {shows.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Upcoming shows
            </h2>
            <ul className="space-y-2">
              {shows.map((show, i) => (
                <li
                  key={`${show.date}-${show.venue}-${i}`}
                  className={`rounded-md border px-3 py-2.5 ${
                    show.starredBy.length > 0
                      ? "border-amber-400/40 bg-amber-400/[0.06]"
                      : "border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)]"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[#E8E0D0]">
                      {formatShowDate(show.date)}
                    </span>
                    {show.link && (
                      <a
                        href={ensureUrl(show.link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-[#E8E0D0]/70 underline decoration-[#E8E0D0]/30 underline-offset-2 transition hover:text-[#E8E0D0]"
                      >
                        Tickets / Info →
                      </a>
                    )}
                  </div>
                  {show.title && (
                    <p className="mt-0.5 text-sm font-medium text-[#E8E0D0]/90">
                      {show.title}
                      {show.starredBy.length > 0 && (
                        <span className="ml-1.5 text-amber-400">★</span>
                      )}
                    </p>
                  )}
                  {show.venue && (
                    <p className="mt-0.5 text-sm text-[#E8E0D0]/75">
                      {show.venue}
                    </p>
                  )}
                  {show.notes && (
                    <p className="mt-0.5 text-xs text-[#E8E0D0]/50">
                      {show.notes}
                    </p>
                  )}
                  {pressNotes(show.starredBy, show.starredNotes, press).map(
                    (note) => (
                      <div key={note.id} className="mt-1.5">
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
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sidebar extras — directly under the photo */}
      <div className="space-y-5 md:col-start-1 md:row-start-2">
        <BandLinks band={band} />
        <ContactMethod band={band} />
      </div>
    </div>
  );
}
