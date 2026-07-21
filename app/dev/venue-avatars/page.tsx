import VenueAvatar from "@/components/VenueAvatar";
import { fetchVenues } from "@/lib/fetchVenues";
import { autoInitials } from "@/lib/venueColor";

// Manual label-length cases (not real venues) to check the font-size scaling
// in components/VenueAvatar.tsx once a label runs longer than 2-3 letters.
const LABEL_LENGTH_CASES = [
  { slug: "the-cedar", label: "TC" },
  { slug: "caydence", label: "Caydence" },
  { slug: "underground-music-cafe", label: "Underground" },
];

// Isolated preview of the new VenueAvatar treatment against real venue
// slugs, so the texture/hue/initials look can be reviewed before it touches
// the venue grid. Not linked from anywhere; visit directly.
export default async function VenueAvatarsDevPage() {
  const venues = (await fetchVenues()).slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">VenueAvatar preview</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        {venues.length} real venues, textured background hue-shifted per
        slug, initials from <code>avatar_initials</code> or auto-derived.
      </p>

      <div className="mt-8 flex flex-wrap gap-6">
        {venues.map((venue) => (
          <div key={venue.slug} className="flex flex-col items-center gap-2">
            <VenueAvatar
              slug={venue.slug}
              initials={venue.avatarInitials || autoInitials(venue.name)}
              size={96}
              className="rounded-md"
            />
            <span className="max-w-[96px] truncate text-center text-xs text-[#E8E0D0]/70">
              {venue.name}
            </span>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-medium text-[#E8E0D0]/80">
        Label-length cases
      </h2>
      <div className="mt-4 flex flex-wrap gap-6">
        {LABEL_LENGTH_CASES.map((c) => (
          <div key={c.slug} className="flex flex-col items-center gap-2">
            <VenueAvatar
              slug={c.slug}
              initials={c.label}
              size={96}
              className="rounded-md"
            />
            <span className="max-w-[96px] truncate text-center text-xs text-[#E8E0D0]/70">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
