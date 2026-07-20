import type { Metadata } from "next";
import ShowSubmitForm, {
  type BandOption,
  type ShowInitial,
} from "@/components/ShowSubmitForm";
import { fetchBands } from "@/lib/fetchBands";

export const metadata: Metadata = {
  title: "Add a Show — Twin Scene",
  description: "Add an upcoming show for a band in the Twin Cities directory.",
};

/** First value for a query param that may arrive as string | string[]. */
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ShowSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const bands = await fetchBands();
  // Lean list for the client component — just what the picker needs.
  const bandOptions = bands.map((b) => ({ slug: b.slug, name: b.name }));

  // Edit mode: /shows/submit?edit=<id>&… with the show's fields round-tripped
  // from the shows list (see editHref in app/shows/page.tsx).
  const sp = await searchParams;
  const editId = one(sp.edit);
  let initial: ShowInitial | undefined;
  if (editId) {
    const bySlug = new Map(bandOptions.map((b) => [b.slug, b]));
    const initialBands: BandOption[] = one(sp.bandSlugs)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((slug) => bySlug.get(slug) ?? { slug, name: slug });
    initial = {
      id: editId,
      date: one(sp.date),
      venue: one(sp.venue),
      title: one(sp.title),
      lineup: one(sp.lineup),
      notes: one(sp.notes),
      link: one(sp.link),
      bands: initialBands,
    };
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <ShowSubmitForm
        bands={bandOptions}
        mode={initial ? "edit" : "add"}
        initial={initial}
      />
    </main>
  );
}
