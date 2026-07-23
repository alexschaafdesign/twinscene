import Link from "next/link";
import type { Metadata } from "next";
import { getAllComrades } from "@/lib/comrades";
import ComradeGrid from "@/components/ComradeGrid";

export const metadata: Metadata = {
  title: "Comrades — Twin Scene",
  description:
    "Recording studios, record labels, and other fixtures of the Twin Cities music scene that aren't bands or musicians.",
};

// getAllComrades() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this the page gets cached after its
// first post-deploy render and goes stale on any later edit. Same note as
// /photo-video.
export const dynamic = "force-dynamic";

export default async function ComradesPage() {
  const comrades = await getAllComrades();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Comrades</h1>
        <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
          Studios, labels, and the rest of the scene that isn&apos;t a band or musician.
        </p>
      </header>

      <ComradeGrid
        comrades={comrades}
        intro={
          <Link
            href="/comrades/submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            + Add a comrade
          </Link>
        }
      />
    </main>
  );
}
