import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { fetchMusiciansDirectory, getMusicianForUser } from "@/lib/musicians";
import MusiciansTable from "@/components/MusiciansTable";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Musicians — Twin Scene",
  description:
    "Every musician in the Twin Cities Music Scene directory, ranked by how many bands they play in.",
});

// fetchMusiciansDirectory() reads the DB directly, so force dynamic rendering
// the same way the home page does — otherwise this would prerender once and
// go stale.
export const dynamic = "force-dynamic";

export default async function MusiciansPage() {
  const user = await getCurrentUser();
  const [musicians, musician] = await Promise.all([
    fetchMusiciansDirectory(),
    user ? getMusicianForUser(user.id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      {/* Visually hidden — every page needs an h1 for accessibility/SEO, but
          the header row (search/sort + CTA) carries the visual identity
          now, same as the home page. */}
      <h1 className="sr-only">Musicians — Twin Scene</h1>

      <MusiciansTable
        musicians={musicians}
        intro={
          musician ? (
            <p className="text-sm text-[#E8E0D0]/60">
              You&apos;re listed as{" "}
              <Link
                href={`/m/${musician.slug}`}
                className="underline underline-offset-2 hover:text-[#E8E0D0]"
              >
                {musician.name}
              </Link>
              .
            </p>
          ) : (
            <Link
              href="/profile/musician?next=/musicians"
              className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
            >
              + Not listed? Add yourself
            </Link>
          )
        }
      />
    </main>
  );
}
