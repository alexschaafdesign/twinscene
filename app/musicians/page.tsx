import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { fetchMusiciansDirectory, getMusicianForUser } from "@/lib/musicians";
import MusiciansTable from "@/components/MusiciansTable";

export const metadata: Metadata = {
  title: "Musicians — Twin Scene",
  description:
    "Every musician in the Twin Cities Music Scene directory, ranked by how many bands they play in.",
};

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
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Musicians
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Every person listed as a band member, ranked by how many bands
          they&apos;re in. Only bands that have listed their members show up
          here — most haven&apos;t yet, so this is a small (but growing) slice
          of the scene.
        </p>
        {musician ? (
          <p className="mt-3 text-sm text-[#E8E0D0]/60">
            You&apos;re listed as{" "}
            <Link href={`/m/${musician.slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
              {musician.name}
            </Link>
            .
          </p>
        ) : (
          <Link
            href="/profile/musician?next=/musicians"
            className="mt-3 inline-block rounded-md border border-[#E8E0D0]/25 px-3.5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
          >
            Not listed? Add yourself
          </Link>
        )}
      </header>

      <MusiciansTable musicians={musicians} />
    </main>
  );
}
