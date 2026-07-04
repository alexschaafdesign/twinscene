import Link from "next/link";
import type { Metadata } from "next";
import SubmitForm from "@/components/SubmitForm";
import { fetchBands } from "@/lib/fetchBands";

export const metadata: Metadata = {
  title: "Add your band — Twin Cities Music Scene",
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
        initialContactEmail={param("contactEmail")}
        initialContactMethod={param("contactMethod")}
        initialStarted={param("started")}
        initialWebsite={param("website")}
        initialInstagram={param("instagram")}
        initialBandcamp={param("bandcamp")}
        initialSpotify={param("spotify")}
        initialBio={param("bio")}
        initialImage={param("image")}
        genreOptions={genreOptions}
      />
    </main>
  );
}
