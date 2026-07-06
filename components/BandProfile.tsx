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
import BandcampPlayer from "@/components/BandcampPlayer";
import {
  IconLink,
  PlaceLine,
  ensureUrl,
  formatShowDate,
  iconProps,
} from "@/components/band-shared";
import { BandImage, CopyButton } from "@/components/band-shared-client";

/** Prefilled "correct this band" submit URL — shown in the profile header. */
export function editHref(band: Band): string {
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
  });
  return `/submit?${params.toString()}`;
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
}: {
  band: Band;
  shows?: Show[];
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
          <h1 className="text-3xl font-medium leading-tight sm:text-4xl">
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
        <p className="whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/85">
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

        {/* Bandcamp player — right below the bio */}
        {hasBandcamp && (
          <BandcampPlayer
            name={band.name}
            bandcamp={band.bandcamp}
            bandcampEmbedUrl={band.bandcampEmbedUrl}
            bandcampEmbedHeight={band.bandcampEmbedHeight}
          />
        )}

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
                  className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] px-3 py-2.5"
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
