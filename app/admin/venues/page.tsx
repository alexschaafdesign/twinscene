import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { fetchVenues } from "@/lib/fetchVenues";
import AllVenuesPanel from "@/components/AllVenuesPanel";

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
  const venues = await fetchVenues({ includeHidden: true });

  return <AllVenuesPanel venues={venues} />;
}
