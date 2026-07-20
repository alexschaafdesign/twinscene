import Link from "next/link";
import type { Metadata } from "next";
import { getAllMediaPros } from "@/lib/mediaPros";
import MediaProGrid from "@/components/MediaProGrid";

export const metadata: Metadata = {
  title: "Photo/Video — Twin Scene",
  description: "Photographers and videographers in the Twin Cities music scene.",
};

// getAllMediaPros() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this the page gets cached after its
// first post-deploy render and goes stale on any later edit.
export const dynamic = "force-dynamic";

export default async function PhotoVideoPage() {
  const mediaPros = await getAllMediaPros();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Photo/Video
          </h1>
          <Link
            href="/photo-video/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add yourself →
          </Link>
        </div>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Photographers and videographers who shoot the Twin Cities scene.
        </p>
      </header>

      <MediaProGrid
        mediaPros={mediaPros}
        intro={
          <>
            <p className="text-[13px] leading-relaxed text-[#E8E0D0]/75">
              <span className="font-semibold text-[#E8E0D0]">Photo/Video</span> —
              search to find someone, or add yourself if you&apos;re not listed
              yet.
            </p>
            <Link
              href="/photo-video/submit"
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
            >
              + Add yourself
            </Link>
          </>
        }
      />
    </main>
  );
}
