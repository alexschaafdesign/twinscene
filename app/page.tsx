import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import BandGrid from "@/components/BandGrid";

export default async function Home() {
  const bands = await fetchBands();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8 flex items-center justify-between gap-4">
        <span className="text-sm font-medium tracking-tight text-[#E8E0D0] sm:text-base">
          Twin Cities Music Scene
        </span>
        <Link
          href="/submit"
          className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
        >
          Add your band →
        </Link>
      </nav>

      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
          Twin Cities Music Scene
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">
          A curated index of the Twin Cities music scene, maintained by{" "}
          <a
            href="https://thebirdhaus.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition hover:text-[#E8E0D0]"
          >
            The Birdhaus
          </a>
          .
        </p>
      </header>

      <BandGrid bands={bands} />
    </main>
  );
}
