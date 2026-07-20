// Shared band profile content — the photo, name, location, genres, Bandcamp
// player, bio, upcoming shows, social links and preferred contact method.
//
// Full-width, two-column layout for the dedicated /bands/[slug] page: a left
// sidebar (photo, player, links, contact) and a wider main column (name, bio,
// shows). Items are placed explicitly per grid cell on md+, and fall back to a
// single readable column on mobile (photo → name → player → bio → shows →
// links → contact). The surrounding chrome (back / edit links) is supplied by
// the page, using `editHref` below.
//
// The body is assembled from a registry of named sections (SECTIONS below)
// placed by a BandProfileLayout — see lib/bandProfileLayout.ts for the ids and
// the default arrangement. Name, actions and photo are page furniture and stay
// pinned outside the registry. Adding a section means adding a renderer here
// and an id there; nothing else needs to know about it.

import Link from "next/link";
import type { ReactNode } from "react";
import type { Band } from "@/lib/fetchBands";
import type { Show } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";
import type { VideoRow } from "@/lib/videos";
import type { ShowStatus } from "@/lib/showSaves";
import type { BandMusician } from "@/lib/musicians";
import type { PendingBandMemberClaim } from "@/lib/bandMemberClaims";
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
import { ShowStatusButtons } from "@/components/ShowStatusButtons";
import BandMemberClaimSection from "@/components/BandMemberClaimSection";
import BandMemberClaimsManager from "@/components/BandMemberClaimsManager";
import BandProfileShell from "@/components/BandProfileShell";
import ProfileLayoutEditor from "@/components/ProfileLayoutEditor";
import {
  DEFAULT_LAYOUT,
  type BandProfileLayout,
  type Region,
  type SectionId,
} from "@/lib/bandProfileLayout";
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
    bandcampLink: band.bandcampLink,
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

/** Shared section heading — small, uppercase, muted. */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
      {children}
    </h2>
  );
}

/** Everything any section might need. Sections take the whole bundle so the
 * registry can stay a uniform `(props) => ReactNode` map. */
type SectionProps = {
  band: Band;
  members: BandMusician[];
  shows: Show[];
  press: Press[];
  videos: VideoRow[];
  today: string;
  showStatuses: Record<string, ShowStatus>;
  loggedIn: boolean;
  showClaimEntry: boolean;
  hasOwner: boolean;
  pendingMemberClaims: PendingBandMemberClaim[];
};

/** Band-curated highlight links, shown as image cards (or text-only cards). */
function FeaturedLinks({ band }: SectionProps) {
  if (band.featuredLinks.length === 0) return null;

  return (
    <div>
      <SectionHeading>Featured</SectionHeading>
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
function BandVideos({ videos }: SectionProps) {
  if (videos.length === 0) return null;

  return (
    <div>
      <SectionHeading>
        Videos from{" "}
        <a
          href="https://www.youtube.com/@UnderCurrentMPLS"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[#E8E0D0]/30 underline-offset-2 transition hover:text-[#E8E0D0]/85"
        >
          UnderCurrentMPLS
        </a>
      </SectionHeading>
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

function BandLinks({ band }: SectionProps) {
  // Prefer the plain bandcampLink field; fall back to the embed field's raw
  // URL for bands that only ever filled that one in (never an <iframe>
  // snippet, which isn't a usable href).
  const bandcampHref =
    band.bandcampLink || (band.bandcamp && !band.bandcamp.includes("<iframe") ? band.bandcamp : "");
  const hasAny = band.website || band.instagram || bandcampHref;
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
      {bandcampHref && (
        <IconLink href={ensureUrl(bandcampHref)} label="Bandcamp">
          <svg {...iconProps}>
            <path d="M4 16l5-8h11l-5 8z" />
          </svg>
        </IconLink>
      )}
    </div>
  );
}

/** Surface the band's preferred contact method. */
function ContactMethod({ band }: SectionProps) {
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

function Bio({ band }: SectionProps) {
  return (
    <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
      {band.bio || "No bio yet."}
    </p>
  );
}

function Members({ members }: SectionProps) {
  if (members.length === 0) return null;

  return (
    <div>
      <SectionHeading>Members</SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Link
            key={m.id}
            href={`/m/${m.slug}`}
            className="rounded-full bg-[#E8E0D0]/10 px-2.5 py-0.5 text-xs text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/20 hover:text-[#E8E0D0]"
          >
            {m.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Owner/admin-only: pending band-member requests for this band. */
function MemberClaims({ pendingMemberClaims }: SectionProps) {
  if (pendingMemberClaims.length === 0) return null;

  return (
    <div>
      <SectionHeading>Pending member requests</SectionHeading>
      <BandMemberClaimsManager initialClaims={pendingMemberClaims} scope="band" />
    </div>
  );
}

/** Member-request entry for an already-owned band, shown to visitors who can't
 * already edit it — sending a request the owner reviews. The unclaimed-band
 * "Is this your band?" entry now lives in the page top bar beside the
 * Unclaimed tag (app/bands/[slug]/page.tsx). */
function ClaimEntry({ band, members, loggedIn, showClaimEntry, hasOwner }: SectionProps) {
  if (!showClaimEntry || !hasOwner) return null;
  return <BandMemberClaimSection bandSlug={band.slug} members={members} loggedIn={loggedIn} />;
}

function Music({ band }: SectionProps) {
  if (!band.bandcampEmbedUrl && !band.bandcamp) return null;

  return (
    <BandcampPlayer
      name={band.name}
      bandcamp={band.bandcamp}
      bandcampEmbedUrl={band.bandcampEmbedUrl}
      bandcampEmbedHeight={band.bandcampEmbedHeight}
    />
  );
}

function UpcomingShows({
  band,
  shows,
  press,
  today,
  showStatuses,
  loggedIn,
}: SectionProps) {
  if (shows.length === 0) return null;

  return (
    <div>
      <SectionHeading>Upcoming shows</SectionHeading>
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
            {show.id && (
              <div className="mt-2">
                <ShowStatusButtons
                  showId={show.id}
                  isPast={show.date < today}
                  initialStatus={showStatuses[show.id] ?? null}
                  loggedIn={loggedIn}
                  returnTo={`/bands/${band.slug}`}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Section id → how to render it, and whether it currently has anything to
 * show. Keep in sync with SectionId in lib/bandProfileLayout.ts; the layout
 * there decides order and placement.
 *
 * `isEmpty` exists for the in-place editor: a section with no content renders
 * nothing, and you can't drag something that isn't in the DOM. The editor
 * substitutes a placeholder so an empty section is still arrangeable — the
 * band can put Videos where they want it before there are any videos. */
const SECTIONS: Record<
  SectionId,
  { render: (props: SectionProps) => ReactNode; isEmpty: (props: SectionProps) => boolean }
> = {
  bio: { render: Bio, isEmpty: () => false }, // falls back to "No bio yet."
  members: { render: Members, isEmpty: (p) => p.members.length === 0 },
  memberClaims: { render: MemberClaims, isEmpty: (p) => p.pendingMemberClaims.length === 0 },
  claimEntry: { render: ClaimEntry, isEmpty: (p) => !p.showClaimEntry || !p.hasOwner },
  featured: { render: FeaturedLinks, isEmpty: (p) => p.band.featuredLinks.length === 0 },
  music: { render: Music, isEmpty: (p) => !p.band.bandcampEmbedUrl && !p.band.bandcamp },
  videos: { render: BandVideos, isEmpty: (p) => p.videos.length === 0 },
  shows: { render: UpcomingShows, isEmpty: (p) => p.shows.length === 0 },
  links: {
    render: BandLinks,
    isEmpty: (p) =>
      !p.band.website &&
      !p.band.instagram &&
      !p.band.bandcampLink &&
      !(p.band.bandcamp && !p.band.bandcamp.includes("<iframe")),
  },
  contact: { render: ContactMethod, isEmpty: () => false }, // falls back to "Not set yet"
};

/** Render one region's sections in order. Sections that have nothing to show
 * return null, which keeps them out of the DOM entirely — so the container's
 * `space-y-*` never opens a gap for an absent section. */
function renderRegion(region: Region, layout: BandProfileLayout, props: SectionProps) {
  return layout[region].map((id) => {
    const Section = SECTIONS[id].render;
    return <Section key={id} {...props} />;
  });
}

/** Every section rendered once, keyed by id — what the in-place editor needs.
 * The sections stay server-rendered here (they read the DB); the client editor
 * only reorders the finished nodes, so it never needs the data itself. */
function renderAllSections(props: SectionProps): Partial<Record<SectionId, ReactNode>> {
  const out: Partial<Record<SectionId, ReactNode>> = {};
  for (const id of Object.keys(SECTIONS) as SectionId[]) {
    const Section = SECTIONS[id].render;
    out[id] = <Section {...props} />;
  }
  return out;
}

/** Ids whose section would render nothing right now. */
function emptySectionIds(props: SectionProps): SectionId[] {
  return (Object.keys(SECTIONS) as SectionId[]).filter((id) => SECTIONS[id].isEmpty(props));
}

/** Current values for each in-place-editable section's fields, to prefill the
 * inspector. Kept next to the section renderers so a new editable field is
 * mapped here in the same place it's declared in SECTION_EDIT. */
function sectionFieldValues(band: Band): Partial<Record<SectionId, Record<string, string>>> {
  return {
    bio: { bio: band.bio },
  };
}

export default function BandProfile({
  band,
  members,
  shows = [],
  press = [],
  videos = [],
  today,
  showStatuses = {},
  loggedIn = false,
  showClaimEntry = false,
  hasOwner = true,
  pendingMemberClaims = [],
  layout = DEFAULT_LAYOUT,
  canEdit = false,
  actions,
}: {
  band: Band;
  /** Real `musicians` rows via `band_members`, in display order
   * (lib/musicians.ts getBandMembers) — the current source of truth for
   * display, separate from the raw `bands.members` string mirror on `band`. */
  members: BandMusician[];
  shows?: Show[];
  press?: Press[];
  videos?: VideoRow[];
  /** "YYYY-MM-DD" in America/Chicago, for the upcoming/past split on each show. */
  today: string;
  /** Logged-in user's attendance status per show id. */
  showStatuses?: Record<string, ShowStatus>;
  loggedIn?: boolean;
  /** Show a claim entry point — the page decides this (viewer doesn't
   * already have edit access to the band). */
  showClaimEntry?: boolean;
  /** Band-wide: does anyone hold the 'owner' role on this band? Picks which
   * claim entry point showClaimEntry renders — ClaimOwnershipButton when
   * unclaimed, BandMemberClaimSection ("are you in this band?") once it has
   * an owner to review member requests. Defaults true (the safer of the two
   * when a caller omits it — never dangles a stray ownership claim button). */
  hasOwner?: boolean;
  /** Pending band_member_claims for this band — non-empty only when the
   * viewer canApproveMemberClaim (owner or admin), so the page fetches this
   * conditionally. */
  pendingMemberClaims?: PendingBandMemberClaim[];
  /** Section order and visibility. Defaults to the standard arrangement;
   * pass a normalized layout (lib/bandProfileLayout.ts) to vary it. */
  layout?: BandProfileLayout;
  /** Viewer may edit this band — turns on the in-place layout editor. The
   * page decides it via canEditBand; this only controls whether the editing
   * affordances render, never whether a save is allowed (the PATCH route
   * re-checks server-side). */
  canEdit?: boolean;
  /** Ownership/edit action buttons (Claim, Follow, Edit, admin Manage) — the
   * page assembles these (they need page-level data like `canEdit`) but they
   * render inline with the band name so the header stays a single row. */
  actions?: ReactNode;
}) {
  const sectionProps: SectionProps = {
    band,
    members,
    shows,
    press,
    videos,
    today,
    showStatuses,
    loggedIn,
    showClaimEntry,
    hasOwner,
    pendingMemberClaims,
  };

  const photo = <BandImage band={band} className="rounded-md ring-1 ring-[#E8E0D0]/10" />;

  const header = (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">{band.name}</h1>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
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
  );

  // Editors get the in-place arranger wrapped around the real profile: same
  // grid, same server-rendered sections, plus an "Edit layout" toggle that
  // drops draggable overlays over them. Everyone else renders the plain view
  // and ships no editor JavaScript at all.
  if (canEdit) {
    return (
      <ProfileLayoutEditor
        slug={band.slug}
        initialLayout={layout}
        sections={renderAllSections(sectionProps)}
        emptyIds={emptySectionIds(sectionProps)}
        fieldValues={sectionFieldValues(band)}
        photo={photo}
        header={header}
      />
    );
  }

  return (
    <BandProfileShell
      photo={photo}
      header={header}
      main={renderRegion("main", layout, sectionProps)}
      sidebar={renderRegion("sidebar", layout, sectionProps)}
    />
  );
}
