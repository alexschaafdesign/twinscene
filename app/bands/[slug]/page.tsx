import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { SHOWS_ENABLED } from "@/lib/features";
import BandProfile, { editHref } from "@/components/BandProfile";
import { iconProps } from "@/components/band-shared";

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

  const description =
    band.bio ||
    `${band.name}${band.location ? ` — ${band.location}` : ""} on Twin Scene, the Twin Cities music directory.`;

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
  const bandShows = shows.filter((s) => s.bandSlugs.includes(slug));

  return (
    <>
      {/* Backdrop — clicking it returns to the directory. */}
      <Link
        href="/bands"
        aria-label="Back to directory"
        className="animate-overlay fixed inset-0 z-40 bg-black/50"
      />

      {/*
        Drawer overlay over the persistent grid:
        - Mobile (< md): full-screen, slides up from the bottom.
        - Desktop (md+): fixed 420px panel, right-anchored, slides in from the right.
        Entrance animation is CSS-only (see .animate-drawer). There's no exit
        animation — navigating away unmounts the route immediately.
      */}
      <aside
        aria-label={`${band.name} profile`}
        className="animate-drawer fixed inset-0 z-50 flex flex-col bg-[#2A2420] md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:border-l md:border-[#E8E0D0]/15 md:shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E8E0D0]/15 px-5 py-3">
          {/* Mobile: prominent back link */}
          <Link
            href="/bands"
            className="flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80 md:hidden"
          >
            <span aria-hidden>←</span> Back to directory
          </Link>

          {/* Edit this band */}
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

          {/* Desktop: icon close button */}
          <Link
            href="/bands"
            aria-label="Close"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-[#E8E0D0]/70 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0] md:flex"
          >
            <svg {...iconProps} width={20} height={20}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <BandProfile band={band} shows={bandShows} />
        </div>
      </aside>
    </>
  );
}
