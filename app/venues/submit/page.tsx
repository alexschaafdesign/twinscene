import type { Metadata } from "next";
import { redirect } from "next/navigation";
import VenueSubmitForm from "@/components/VenueSubmitForm";
import { fetchVenues } from "@/lib/fetchVenues";
import { getVenueBySlug } from "@/lib/venues";
import { getCurrentUser, canEditVenue } from "@/lib/auth";
import { NEIGHBORHOOD_OPTIONS } from "@/lib/neighborhoods";

export const metadata: Metadata = {
  title: "Add a venue — Twin Scene",
  description: "Add a venue to the Twin Cities music scene directory.",
};

export default async function VenueSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const isCorrect = sp.correct === "true";
  const param = (key: string): string => {
    const v = sp[key];
    return typeof v === "string" ? v : "";
  };

  // Adding or correcting a venue both require an account now — venues have
  // no anonymous write path any more than bands or media-pro listings do.
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((val) => [k, val]),
      ),
    ).toString();
    redirect(`/login?next=${encodeURIComponent(`/venues/submit${qs ? `?${qs}` : ""}`)}`);
  }

  if (isCorrect) {
    const venue = param("venue") ? await getVenueBySlug(param("venue")) : null;
    if (!venue || !(await canEditVenue(user, venue.id))) {
      return (
        <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
          <p className="text-sm text-[#F5A3A3]">
            {venue ? "You don't have edit access to this venue." : "Venue not found."}
          </p>
        </main>
      );
    }
  }

  const venues = await fetchVenues();

  // Neighborhood suggestions: the seeded Twin Cities list merged with any
  // neighborhoods existing venues already use.
  const neighborhoodOptions = Array.from(
    new Set([...NEIGHBORHOOD_OPTIONS, ...venues.map((v) => v.neighborhood)]),
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  // Type suggestions come entirely from venues already in the directory.
  const typeOptions = Array.from(new Set(venues.map((v) => v.type)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <VenueSubmitForm
        mode={isCorrect ? "correct" : "add"}
        initialSlug={param("venue")}
        initialName={param("name")}
        initialAddress={param("address")}
        initialLocation={param("location")}
        initialNeighborhood={param("neighborhood")}
        initialCapacity={param("capacity")}
        initialContact={param("contact")}
        initialType={param("type")}
        initialOwner={param("owner")}
        initialParking={param("parking")}
        initialAccessibility={param("accessibility")}
        initialNotes={param("notes")}
        initialImage={param("image")}
        neighborhoodOptions={neighborhoodOptions}
        typeOptions={typeOptions}
      />
    </main>
  );
}
