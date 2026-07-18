import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { fetchAllShows } from "@/lib/fetchShows";
import AllShowsPanel from "@/components/AllShowsPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Shows — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function AdminShowsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/shows");
  if (!isAdmin(user)) return <NotAdmin />;

  // Handed to AllShowsPanel for its SCRAPE_SECRET-gated show API calls; this
  // page is is_admin-gated, so only admins receive it.
  const secret = process.env.SCRAPE_SECRET ?? "";
  const shows = await fetchAllShows();

  return <AllShowsPanel shows={shows} secret={secret} />;
}
