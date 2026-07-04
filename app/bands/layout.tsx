import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import BandGrid from "@/components/BandGrid";
import { SHOWS_ENABLED } from "@/lib/features";

// The /bands section: the filterable directory grid is the persistent backdrop,
// and {children} renders on top of it. On /bands it's empty (see page.tsx); on
// /bands/[slug] it's the profile, framed as a drawer overlay so the grid stays
// mounted underneath — no reflow when moving between bands.
export default async function BandsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bands = await fetchBands();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 flex items-center justify-between gap-4 border-b border-[#E8E0D0]/20 pb-6">
        <Link href="/" aria-label="Twin Scene home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Twin Scene" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          {SHOWS_ENABLED && (
            <Link
              href="/shows"
              className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10"
            >
              Shows
            </Link>
          )}
          <Link
            href="/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add your band →
          </Link>
        </div>
      </header>

      <BandGrid bands={bands} />
      {children}
    </main>
  );
}
