import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { fetchVenues } from "@/lib/fetchVenues";
import { getVenueAgeRules } from "@/lib/scrapers/venueAgeRules";
import AllVenuesPanel from "@/components/AllVenuesPanel";
import VenueAgeRulesPanel from "@/components/VenueAgeRulesPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Venues — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function AdminVenuesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/venues");
  if (!isAdmin(user)) return <NotAdmin />;

  // includeHidden so the admin can see and unhide already-archived venues.
  const [venues, ageRules] = await Promise.all([
    fetchVenues({ includeHidden: true }),
    getVenueAgeRules(),
  ]);

  const ageRuleItems = ageRules.map((r) => ({
    venueName: r.venueName,
    restriction: r.restriction,
    appliesAfter: r.appliesAfter ?? "",
  }));

  // AllVenuesPanel renders its own <main>; the age-rules panel sits above it in
  // a matching-width container so the two read as one page.
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 text-[#E8E0D0] sm:px-8 sm:pt-8">
        <VenueAgeRulesPanel
          venues={venues.map((v) => v.name)}
          rules={ageRuleItems}
        />
      </div>
      <AllVenuesPanel venues={venues} />
    </>
  );
}
