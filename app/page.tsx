import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { getSlugsWithVideos } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth";
import { listFollowedSlugs } from "@/lib/bandFollows";
import BandGrid from "@/components/BandGrid";
import LoginForm from "@/components/LoginForm";

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
          (right) so logged-out visitors have an obvious, one-step way in. On
          mobile they stack. items-start keeps each card its natural height
          rather than stretching the short sign-in card to match the tall
          bullet list. */}
      <div className="mb-6 grid items-start gap-4 sm:grid-cols-2">
      <div
        role="status"
        className="rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-4 py-3.5 text-[13px] leading-relaxed text-[#E8E0D0]/90"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="shrink-0 rounded bg-[#E8B84B]/20 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#E8B84B]"
          >
            Beta
          </span>
          <p className="m-0 font-medium text-[#E8E0D0]">
            This site is in early beta — here&apos;s where it&apos;s
            headed, with more to come! Send me any ideas!
          </p>
        </div>
        <ul className="mt-2.5 list-disc space-y-1 pl-8 marker:text-[#E8B84B]/60">
          <li>Every band in town can have a profile, free to edit as you like</li>
          <li>
            Every show in town is listed in the{" "}
            <Link href="/shows" className="underline hover:text-[#E8E0D0]">
              Shows
            </Link>{" "}
            tab (in progress)
          </li>
          <li>
            Shows are automatically linked to bands, so a band&apos;s profile
            shows any upcoming dates
          </li>
          <li>
            The{" "}
            <Link href="/musicians" className="underline hover:text-[#E8E0D0]">
              Musicians
            </Link>{" "}
            tab lists individual members, tracing them across multiple bands
          </li>
          <li>
            Band profiles include any undercurrentMPLS videos of them, pulled
            from undercurrent&apos;s incredible YouTube channel
          </li>
        </ul>
        <p className="m-0 mt-2.5">
          Hit up alex@thebirdhaus.org with any comments/suggestions!
        </p>
      </div>

      {/* Right column: sign-in for logged-out visitors, a quick link to the
          profile for signed-in ones. The magic-link flow is the same whether
          you have an account or not, so the copy leads with that. */}
      {user ? (
        <div className="rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-4 py-3.5 text-right">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]">
            You&apos;re signed in
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#E8E0D0]/70">
            Signed in as{" "}
            <span className="text-[#E8E0D0]">{user.email}</span>. Heart a band
            to follow it — you&apos;ll get a notification when it announces a
            show — and manage your account from your profile.
          </p>
          <Link
            href="/profile"
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
          >
            Go to your profile
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.03] px-4 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]">
            Sign up or log in
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#E8E0D0]/70">
            New here or coming back — it&apos;s the same step. Drop in your
            email and we&apos;ll send a one-tap login link. No password, no
            signup form; if you don&apos;t have an account yet, the link
            creates one.
          </p>
          <LoginForm isDev={isDev} autoFocus={false} />
        </div>
      )}
      </div>

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
