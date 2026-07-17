import Link from "next/link";
import type { Metadata } from "next";
import { fetchBands } from "@/lib/fetchBands";
import { buildMusiciansDirectory } from "@/lib/musicians";
import MusiciansTable from "@/components/MusiciansTable";

export const metadata: Metadata = {
  title: "Musicians — Twin Scene",
  description:
    "Every musician in the Twin Cities Music Scene directory, ranked by how many bands they play in.",
};

// fetchBands() reads the DB directly, so force dynamic rendering the same way
// the home page does — otherwise this would prerender once and go stale.
export const dynamic = "force-dynamic";

export default async function MusiciansPage() {
  const bands = await fetchBands();
  const musicians = buildMusiciansDirectory(bands);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
        >
          <span aria-hidden>←</span> Directory
        </Link>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Musicians
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Every person listed as a band member, ranked by how many bands
          they&apos;re in. Only bands that have listed their members show up
          here — most haven&apos;t yet, so this is a small (but growing) slice
          of the scene.
        </p>
      </header>

      <MusiciansTable musicians={musicians} />
    </main>
  );
}
