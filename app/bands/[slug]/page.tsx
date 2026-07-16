import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { fetchPress } from "@/lib/fetchPress";
import { getVisibleVideosBySlug } from "@/lib/videos";
import { SHOWS_ENABLED } from "@/lib/features";
import BandProfile, { editHref } from "@/components/BandProfile";
import { iconProps, locationLabel } from "@/components/band-shared";

type Props = {
  params: Promise<{ slug: string }>;
};

// Same "fetch all, find by slug" pattern the rest of the app uses. fetchBands
// is cache: 'no-store', so this runs on each request (as does the layout's own
// fetch) — acceptable for a small directory that must reflect the live sheet.
async function getBand(slug: string) {
  const bands = await fetchBands();
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

  const shows = SHOWS_ENABLED ? await fetchShows() : [];
  const press = SHOWS_ENABLED ? await fetchPress() : [];
  const bandShows = shows.filter((s) => s.bandSlugs.includes(slug));
  const videos = await getVisibleVideosBySlug(slug);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
        >
          <span aria-hidden>←</span> Back to directory
        </Link>

        <Link
          href={editHref(band, videos)}
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
      </div>

      <BandProfile band={band} shows={bandShows} press={press} videos={videos} />
    </div>
  );
}
