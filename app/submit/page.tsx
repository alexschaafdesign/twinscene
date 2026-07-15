import Link from "next/link";
import type { Metadata } from "next";
import SubmitForm from "@/components/SubmitForm";
import { fetchBands } from "@/lib/fetchBands";
import { NEIGHBORHOOD_OPTIONS } from "@/lib/neighborhoods";

export const metadata: Metadata = {
  title: "Add your band — Twin Scene",
  description: "Submit your band for inclusion in the directory.",
};

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const isCorrect = sp.correct === "true";
  // Read a single string search param, falling back to "".
  const param = (key: string): string => {
    const v = sp[key];
    return typeof v === "string" ? v : "";
  };

  const band = param("band");
  const name = param("name");

  // Unique, alphabetically sorted genres across all existing bands, used to
  // power the genre tag-input's autocomplete.
  const bands = await fetchBands();
  const genreOptions = Array.from(
    new Set(bands.flatMap((b) => b.genres)),
  ).sort((a, b) => a.localeCompare(b));

  // Neighborhood suggestions: the seeded Twin Cities list merged with any
  // neighborhoods existing bands already use, so real-world additions persist
  // as suggestions for the next person.
  const neighborhoodOptions = Array.from(
    new Set([...NEIGHBORHOOD_OPTIONS, ...bands.flatMap((b) => b.neighborhoods)]),
  ).sort((a, b) => a.localeCompare(b));

  // Member suggestions come entirely from people already in the directory
  // (no seed list), so autocomplete grows as bands list their members.
  const memberOptions = Array.from(
    new Set(bands.flatMap((b) => b.members)),
  ).sort((a, b) => a.localeCompare(b));

  // Name + slug of every band, for the add-form's duplicate check.
  const existingBands = bands.map((b) => ({ name: b.name, slug: b.slug }));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
      >
        <span aria-hidden>←</span> Back to directory
      </Link>

      <SubmitForm
        mode={isCorrect ? "correct" : "add"}
        initialSlug={band}
        initialName={name}
        initialGenres={param("genres")}
        initialLocation={param("location")}
        initialNeighborhoods={param("neighborhoods")}
        initialMembers={param("members")}
        initialContactEmail={param("contactEmail")}
        initialContactMethod={param("contactMethod")}
        initialWebsite={param("website")}
        initialInstagram={param("instagram")}
        initialBandcamp={param("bandcamp")}
        initialBio={param("bio")}
        initialImage={param("image")}
        initialFeaturedLinks={param("featuredLinks")}
        genreOptions={genreOptions}
        neighborhoodOptions={neighborhoodOptions}
        memberOptions={memberOptions}
        existingBands={existingBands}
      />
    </main>
  );
}
