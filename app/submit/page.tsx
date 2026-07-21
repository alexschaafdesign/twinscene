import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SubmitForm from "@/components/SubmitForm";
import { fetchBands } from "@/lib/fetchBands";
import { getBandBySlug } from "@/lib/bands";
import { getAllVideosForBand } from "@/lib/videos";
import { getCurrentUser, canEditBand } from "@/lib/auth";
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

  // Adding or correcting a band both require an account now.
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((val) => [k, val]),
      ),
    ).toString();
    redirect(`/login?next=${encodeURIComponent(`/submit${qs ? `?${qs}` : ""}`)}`);
  }

  // Every existing video row on the band (any status — including one still
  // pending review), fetched fresh here rather than round-tripped through
  // the "Edit this band" link's query string: a link baked at profile-render
  // time can go stale, and a long video list risks the URL itself. This is
  // the authoritative source the form seeds from.
  let existingVideos: { id: number; video_url: string; video_title: string; status: string }[] = [];
  if (isCorrect) {
    const targetBand = band ? await getBandBySlug(band) : null;
    if (!targetBand || !(await canEditBand(user, targetBand.id))) {
      return (
        <main className="mx-auto w-full max-w-4xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
          <p className="text-sm text-[#F5A3A3]">
            {targetBand ? "You don't have edit access to this band." : "Band not found."}
          </p>
        </main>
      );
    }
    existingVideos = await getAllVideosForBand(targetBand.id);
  }

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
    <main className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
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
        initialBandcampLink={param("bandcampLink")}
        initialBio={param("bio")}
        initialImage={param("image")}
        initialFeaturedLinks={param("featuredLinks")}
        initialExistingVideos={existingVideos}
        genreOptions={genreOptions}
        neighborhoodOptions={neighborhoodOptions}
        memberOptions={memberOptions}
        existingBands={existingBands}
      />
    </main>
  );
}
