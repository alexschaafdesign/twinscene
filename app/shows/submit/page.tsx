import Link from "next/link";
import type { Metadata } from "next";
import ShowSubmitForm from "@/components/ShowSubmitForm";
import { fetchBands } from "@/lib/fetchBands";

export const metadata: Metadata = {
  title: "Add a Show — Twin Scene",
  description: "Add an upcoming show for a band in the Twin Cities directory.",
};

export default async function ShowSubmitPage() {
  const bands = await fetchBands();
  // Lean list for the client component — just what the picker needs.
  const bandOptions = bands.map((b) => ({ slug: b.slug, name: b.name }));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/shows"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
      >
        <span aria-hidden>←</span> Upcoming Shows
      </Link>

      <ShowSubmitForm bands={bandOptions} />
    </main>
  );
}
