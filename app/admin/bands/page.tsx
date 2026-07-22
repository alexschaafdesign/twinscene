import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { fetchBands } from "@/lib/fetchBands";
import AllBandsPanel from "@/components/AllBandsPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Bands — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function AdminBandsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/bands");
  if (!isAdmin(user)) return <NotAdmin />;

  // includeHidden so the admin can see and unhide already-archived bands.
  const bands = await fetchBands({ includeHidden: true });

  return <AllBandsPanel bands={bands} />;
}
