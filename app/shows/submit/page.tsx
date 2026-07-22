import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ShowSubmitForm, {
  type BandOption,
  type ShowInitial,
} from "@/components/ShowSubmitForm";
import { fetchBands } from "@/lib/fetchBands";
import { fetchVenues } from "@/lib/fetchVenues";
import { getCurrentUser } from "@/lib/auth";
import { parseDisplayTime } from "@/lib/showTime";

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
  // Adding or editing a show both require an account now — no per-show
  // ownership model, so one gate covers both modes.
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((val) => [k, val]),
      ),
    ).toString();
    redirect(`/login?next=${encodeURIComponent(`/shows/submit${qs ? `?${qs}` : ""}`)}`);
  }

  const [bands, venues] = await Promise.all([fetchBands(), fetchVenues()]);
  // Lean list for the client component — just what the picker needs.
  const bandOptions = bands.map((b) => ({ slug: b.slug, name: b.name }));
  // Venue names for the dropdown, alphabetized case-insensitively and ignoring a
  // leading "The " so "The Cedar" files under C, "The Birdhaus" under B, etc.
  const venueSortKey = (name: string) => name.replace(/^the\s+/i, "");
  const venueNames = venues
    .map((v) => v.name)
    .sort((a, b) =>
      venueSortKey(a).localeCompare(venueSortKey(b), undefined, {
        sensitivity: "base",
      }),
    );

  // Edit mode: /shows/submit?edit=<id>&… with the show's fields round-tripped
  // from the shows list (see editHref in app/shows/page.tsx).
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
      // Round-tripped as display strings ("7:00pm"); the form's time inputs want
      // 24-hour "HH:MM", so convert here. Unset/unparseable -> "" (empty input).
      musicTime: parseDisplayTime(one(sp.musicTime)) ?? "",
      doorsTime: parseDisplayTime(one(sp.doorsTime)) ?? "",
      genres: one(sp.genres),
      ageRestriction: one(sp.ageRestriction),
      bands: initialBands,
    };
  }

  // Add mode can also be deep-linked with a band preselected (a band's edit
  // form points here so a submitter can add a show we missed). Accepts one
  // slug via ?band= or a comma list via ?bandSlugs=; unknown slugs are dropped.
  const bySlug = new Map(bandOptions.map((b) => [b.slug, b]));
  const prefillBands: BandOption[] = [one(sp.band), one(sp.bandSlugs)]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((slug) => bySlug.get(slug))
    .filter((b): b is BandOption => b !== undefined);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <ShowSubmitForm
        bands={bandOptions}
        venues={venueNames}
        mode={initial ? "edit" : "add"}
        initial={initial}
        // Add mode can be deep-linked with a venue preselected (the admin
        // panel's "Manual scrape required" list does this).
        initialVenue={one(sp.venue)}
        initialBands={prefillBands}
      />
    </main>
  );
}
