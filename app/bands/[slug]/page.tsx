import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { todayInChicago } from "@/lib/fetchShows";
import { fetchPress } from "@/lib/fetchPress";
import {
  getCachedBands,
  getCachedShows,
  getCachedBandBySlug,
  getCachedVisibleVideosBySlug,
} from "@/lib/cachedReads";
import { getCurrentUser, canEditBand, isAdmin } from "@/lib/auth";
import { isBandFollowing } from "@/lib/bandFollows";
import { listShowStatuses } from "@/lib/showSaves";
import { getBandMembers } from "@/lib/musicians";
import { isBandOwner, bandHasOwner } from "@/lib/bandOwnership";
import { canApproveMemberClaim, listPendingClaimsForBand } from "@/lib/bandMemberClaims";
import BandProfile, { editHref } from "@/components/BandProfile";
import ClaimOwnershipButton from "@/components/ClaimOwnershipButton";
import { iconProps, locationLabel } from "@/components/band-shared";
import { FollowBandButton } from "@/components/band-shared-client";
import BackLink from "@/components/BackLink";

type Props = {
  params: Promise<{ slug: string }>;
};

// fetchBands() reads the DB directly (no fetch()), which gives Next no signal
// to render dynamically — without this, a slug page (no generateStaticParams)
// gets cached after its first post-deploy render and goes stale on any later
// edit to that band.
export const dynamic = "force-dynamic";

// Same "fetch all, find by slug" pattern the rest of the app uses.
async function getBand(slug: string) {
  const bands = await getCachedBands();
  return bands.find((b) => b.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const band = await getBand(slug);
  if (!band) return {};

  const place = locationLabel(band);
  const description =
    band.bio ||
    `${band.name}${place ? ` — ${place}` : ""} on Twin Scene, the Twin Cities music directory.`;

  return {
    title: band.name,
    description,
    openGraph: {
      title: band.name,
      description,
      type: "profile",
      // band.image is an absolute external URL, which OG images require.
      images: band.image ? [band.image] : undefined,
    },
  };
}

export default async function BandProfilePage({ params }: Props) {
  const { slug } = await params;
  const band = await getBand(slug);
  if (!band) notFound();

  const shows = await getCachedShows();
  const press = await fetchPress();
  const bandShows = shows.filter((s) => s.bandSlugs.includes(slug));
  const videos = await getCachedVisibleVideosBySlug(slug);

  const user = await getCurrentUser();
  // fetchBands()'s Band shape carries no numeric id (see lib/fetchBands.ts),
  // so a second lookup against the raw row is the cheapest way to get one for
  // isBandFollowing.
  const bandRow = await getCachedBandBySlug(slug);
  const initialFollowing = user && bandRow ? await isBandFollowing(user.id, bandRow.id) : false;
  const showStatuses = user ? await listShowStatuses(user.id, bandShows.map((s) => s.id)) : {};
  const members = bandRow ? await getBandMembers(bandRow.id) : [];
  const isOwner = user && bandRow ? await isBandOwner(user, bandRow.id) : false;
  const hasOwner = bandRow ? await bandHasOwner(bandRow.id) : false;
  const canEdit = user && bandRow ? await canEditBand(user, bandRow.id) : false;
  const canApproveClaims = user && bandRow ? await canApproveMemberClaim(user, bandRow.id) : false;
  const pendingMemberClaims = canApproveClaims && bandRow ? await listPendingClaimsForBand(bandRow.id) : [];

  const actions = (
    <>
      {/* Ownership tag: "Owner" (you) or "Claimed" (someone else). The
          "Unclaimed" state shows no tag — the "Claim this band" button
          below carries that signal instead. */}
      {isOwner ? (
        <span className="rounded-full border border-[#E8E0D0]/30 px-2.5 py-0.5 text-xs font-medium text-[#E8E0D0]/80">
          Owner
        </span>
      ) : hasOwner ? (
        <span className="rounded-full border border-[#E8E0D0]/15 px-2.5 py-0.5 text-xs font-medium text-[#E8E0D0]/45">
          Claimed
        </span>
      ) : null}
      {/* Claim entry for an unclaimed band. Only for visitors who can't
          already edit (!canEdit == showClaimEntry); the member-request flow
          for already-owned bands stays inside BandProfile. */}
      {!canEdit && !hasOwner && <ClaimOwnershipButton loggedIn={!!user} />}
      <FollowBandButton slug={slug} initialFollowing={initialFollowing} loggedIn={!!user} />

      {canEdit && (
        <Link
          href={editHref(band)}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
        >
          {/* ti-edit (Tabler) */}
          <svg {...iconProps} width={15} height={15}>
            <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
            <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" />
            <path d="M16 5l3 3" />
          </svg>
          <span className="md:hidden">Edit</span>
          <span className="hidden md:inline">Edit this band</span>
        </Link>
      )}

      {/* Content editing is in place on the profile itself — editors get a
          per-section Edit pencil (components/EditableProfile.tsx), so there's
          no edit entry point here. Section rearranging is set aside for now;
          the /bands/<slug>/customize list page still performs it but isn't
          linked. */}

      {/* Admin-only shortcut to this band's editors/ownership-code page —
          saves typing the /admin/bands/<slug>/editors URL by hand when a
          band DMs asking to claim their page. */}
      {isAdmin(user) && (
        <Link
          href={`/admin/bands/${slug}/editors`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E8B84B]/40 px-2.5 py-1 text-xs font-medium text-[#E8B84B]/90 transition hover:border-[#E8B84B]/70 hover:text-[#E8B84B]"
        >
          {/* ti-key (Tabler) */}
          <svg {...iconProps} width={14} height={14}>
            <path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.978a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.978a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" />
            <path d="M15 9h.01" />
          </svg>
          Manage
        </Link>
      )}
    </>
  );

  return (
    <div>
      <BackLink href="/" label="Bands" className="mb-6" />
      <BandProfile
        band={band}
        members={members}
        shows={bandShows}
        press={press}
        videos={videos}
        today={todayInChicago()}
        showStatuses={showStatuses}
        loggedIn={!!user}
        showClaimEntry={!canEdit}
        hasOwner={hasOwner}
        pendingMemberClaims={pendingMemberClaims}
        layout={band.profileLayout}
        canEdit={canEdit}
        actions={actions}
      />
    </div>
  );
}
