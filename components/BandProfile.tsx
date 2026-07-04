// Shared band profile content — the photo, name, location, genres, Bandcamp
// player, bio, upcoming shows, social links and preferred contact method.
//
// Extracted from the old drawer in BandGrid.tsx so the dedicated profile route
// (app/bands/[slug]/page.tsx) renders exactly the same markup. This is the
// scrollable content block only; the surrounding chrome (back / edit / close
// header) is supplied by whatever frames it, using `editHref` below.

import type { Band } from "@/lib/fetchBands";
import type { Show } from "@/lib/fetchShows";
import BandcampPlayer from "@/components/BandcampPlayer";
import {
  BandImage,
  CopyButton,
  IconLink,
  ensureUrl,
  formatShowDate,
  iconProps,
  metaLine,
} from "@/components/band-shared";

/** Prefilled "correct this band" submit URL — shown in the profile header. */
export function editHref(band: Band): string {
  const params = new URLSearchParams({
    correct: "true",
    band: band.slug,
    name: band.name,
    genres: band.genres.join(", "),
    location: band.location,
    contactEmail: band.contactEmail,
    contactMethod: band.contactMethod,
    started: band.started != null ? String(band.started) : "",
    website: band.website,
    instagram: band.instagram,
    bandcamp: band.bandcamp,
    bio: band.bio,
    image: band.image,
    spotify: band.spotify,
  });
  return `/submit?${params.toString()}`;
}

function BandLinks({ band }: { band: Band }) {
  const hasAny =
    band.website || band.instagram || band.bandcamp || band.spotify;
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
      {band.bandcamp && (
        <IconLink href={ensureUrl(band.bandcamp)} label="Bandcamp">
          <svg {...iconProps}>
            <path d="M4 16l5-8h11l-5 8z" />
          </svg>
        </IconLink>
      )}
      {band.spotify && (
        <IconLink href={ensureUrl(band.spotify)} label="Spotify">
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M7.5 9.5c3-1 6-1 9 .5M8 13c2.5-.8 5-.6 7 .5M8.5 16c2-.6 4-.4 5.5.4" />
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
    <div className="mt-5">
      <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Preferred contact method
      </h3>
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
  return (
    <>
      <div className="mx-auto max-w-xs">
        <BandImage band={band} className="rounded-md ring-1 ring-[#E8E0D0]/10" />
      </div>

      <div className="mt-5">
        <h2 className="text-2xl font-medium leading-tight">{band.name}</h2>
        {metaLine(band) && (
          <p className="mt-1 text-sm text-[#E8E0D0]/65">{metaLine(band)}</p>
        )}
      </div>

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

      {/* Bandcamp quick-sample player — kept near the top so it's visible
          without scrolling. */}
      {(band.bandcampEmbedUrl || band.bandcamp) && (
        <div className="mt-5">
          <BandcampPlayer
            name={band.name}
            bandcamp={band.bandcamp}
            bandcampEmbedUrl={band.bandcampEmbedUrl}
          />
        </div>
      )}

      <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/85">
        {band.bio || "No bio yet."}
      </p>

      {/* Upcoming shows */}
      {shows.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Upcoming shows
          </h3>
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

      <div className="mt-5">
        <BandLinks band={band} />
      </div>

      <ContactMethod band={band} />
    </>
  );
}
