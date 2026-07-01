import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import BandGrid from "@/components/BandGrid";

export default async function Home() {
  const bands = await fetchBands();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.thebirdhaus.org/misc/Screenshot%202026-06-30%20at%2011.16.26%E2%80%AFPM.png"
            alt="TwinScene — a living directory of every band in the Twin Cities"
            width={1437}
            height={997}
            className="mx-auto block w-full max-w-2xl rounded-lg"
          />
        </h1>
        <div className="mt-4 flex justify-center">
          <Link
            href="/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add your band →
          </Link>
        </div>
      </header>

      <BandGrid bands={bands} />
    </main>
  );
}
