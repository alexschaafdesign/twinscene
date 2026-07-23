import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { matchVenue } from "@/lib/fetchVenues";
import { todayInChicago } from "@/lib/fetchShows";
import { fetchPress } from "@/lib/fetchPress";
import {
  getCachedVenues,
  getCachedShows,
  getCachedAllPastShows,
  getCachedVenueBySlug,
} from "@/lib/cachedReads";
import { getCurrentUser, canEditVenue } from "@/lib/auth";
import { listShowStatuses } from "@/lib/showSaves";
import VenueProfile from "@/components/VenueProfile";
import ClaimVenueButton from "@/components/ClaimVenueButton";
import { venueEditHref, venueLocationLabel } from "@/components/venue-shared";
import { iconProps } from "@/components/band-shared";
import BackLink from "@/components/BackLink";
import { pageMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

// fetchVenues() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this a slug page (no
// generateStaticParams) gets cached after its first post-deploy render and
// goes stale on any later edit to that venue.
export const dynamic = "force-dynamic";

async function getVenue(slug: string) {
  const venues = await getCachedVenues();
  return { venues, venue: venues.find((v) => v.slug === slug) ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { venue } = await getVenue(slug);
  if (!venue) return {};

  const place = venueLocationLabel(venue);
  const description =
    venue.notes ||
    `${venue.name}${place ? ` — ${place}` : ""} on Twin Scene, the Twin Cities music directory.`;

  return pageMetadata({ title: venue.name, description, image: venue.photo });
}

export default async function VenueProfilePage({ params }: Props) {
  const { slug } = await params;
  const { venues, venue } = await getVenue(slug);
  if (!venue) notFound();

  const [shows, pastShows] = await Promise.all([getCachedShows(todayInChicago()), getCachedAllPastShows()]);
  const press = await fetchPress();
  const venueShows = shows.filter(
    (s) => matchVenue(venues, s.venue)?.slug === venue.slug,
  );
  const venuePastShows = pastShows.filter(
    (s) => matchVenue(venues, s.venue)?.slug === venue.slug,
  );
  const user = await getCurrentUser();
  const showStatuses = user
    ? await listShowStatuses(user.id, [...venueShows, ...venuePastShows].map((s) => s.id))
    : {};
  // fetchVenues()'s public Venue shape has no numeric id (see lib/venueUtils.ts);
  // canEditVenue needs the DB row's id, mirroring app/bands/[slug]/page.tsx's
  // bandRow lookup alongside the public `band` used for display.
  const venueRow = await getCachedVenueBySlug(venue.slug);
  const canEdit = venueRow ? await canEditVenue(user, venueRow.id) : false;

  // Admins can jump straight to the Add-a-show form with this venue preselected
  // (the form reads ?venue=<name> — see app/shows/submit/page.tsx).
  const addShowLink = user?.is_admin ? (
    <Link
      href={`/shows/submit?venue=${encodeURIComponent(venue.name)}`}
      className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
    >
      {/* ti-calendar-plus (Tabler) */}
      <svg {...iconProps} width={15} height={15}>
        <path d="M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v5" />
        <path d="M16 3v4" />
        <path d="M8 3v4" />
        <path d="M4 11h16" />
        <path d="M16 19h6" />
        <path d="M19 16v6" />
      </svg>
      <span className="md:hidden">Add show</span>
      <span className="hidden md:inline">Add a show here</span>
    </Link>
  ) : null;

  const editOrClaim = canEdit ? (
    <Link
      href={venueEditHref(venue)}
      className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
    >
      {/* ti-edit (Tabler) */}
      <svg {...iconProps} width={15} height={15}>
        <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
        <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" />
        <path d="M16 5l3 3" />
      </svg>
      <span className="md:hidden">Edit</span>
      <span className="hidden md:inline">Edit this venue</span>
    </Link>
  ) : (
    <ClaimVenueButton slug={venue.slug} loggedIn={!!user} />
  );

  const actions = (
    <>
      {addShowLink}
      {editOrClaim}
    </>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/venues" label="Venues" className="mb-6" />
      <VenueProfile
        venue={venue}
        shows={venueShows}
        pastShows={venuePastShows}
        press={press}
        today={todayInChicago()}
        showStatuses={showStatuses}
        loggedIn={!!user}
        actions={actions}
      />
    </main>
  );
}
