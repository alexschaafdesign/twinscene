import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { getSlugsWithVideos } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth";
import { listFollowedSlugs } from "@/lib/bandFollows";
import BandGrid from "@/components/BandGrid";
import HomeIntroRow from "@/components/HomeIntroRow";

// fetchBands()/fetchShows() read the DB directly (no fetch()), which gives
// Next no signal to render dynamically — without this, the grid gets
// prerendered once and cached indefinitely, going stale on every band edit.
export const dynamic = "force-dynamic";

// The home page: the band directory. It's the site's only section for now, so
// it lives at the root. Individual profiles are at /bands/[slug]; a dedicated
// /bands index can be added later alongside sibling sections (/venues, …).
export default async function Home() {
  // fetchShows() already excludes past dates, so a band's slug showing up
  // here means it has something upcoming.
  const [bands, shows, bandsWithVideos, user] = await Promise.all([
    fetchBands(),
    fetchShows(),
    getSlugsWithVideos(),
    getCurrentUser(),
  ]);
  const followedSlugs = user ? await listFollowedSlugs(user.id) : [];
  const isDev = process.env.NODE_ENV !== "production";
  const bandsWithUpcomingShows = [
    ...new Set(shows.flatMap((s) => s.bandSlugs)),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      {/* The "welcome" header moved up into the persistent site header
          (components/AccountMenu.tsx) as a tagline between the logo and the
          account controls. Only the page's h1 stays here, visually hidden —
          every page needs one for accessibility/SEO, but the visual identity
          now lives in the shared header. */}
      <h1 className="sr-only">Twin Scene — the Twin Cities band directory</h1>

      {/* Two-up row: the beta explainer (left) sits beside a sign-in card
          (right) so logged-out visitors have an obvious, one-step way in.
          Handles its own collapse — once the beta notice is dismissed (or
          there's no sign-in card because the visitor is logged in), it
          renders nothing rather than leaving an empty, margined gap above
          the band grid. */}
      <HomeIntroRow loggedIn={!!user} isDev={isDev} />

      {/* Primary CTA. Handed to BandGrid so it can sit beside the search bar
          (keeps the band grid higher up the page). */}
      <BandGrid
        bands={bands}
        bandsWithUpcomingShows={bandsWithUpcomingShows}
        bandsWithVideos={bandsWithVideos}
        loggedIn={!!user}
        followedSlugs={followedSlugs}
        intro={
          <Link
            href="/submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            + Add your band
          </Link>
        }
      />
    </main>
  );
}
