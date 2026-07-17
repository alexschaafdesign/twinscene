import type { Metadata } from "next";
import { fetchAllShows } from "@/lib/fetchShows";
import AllShowsPanel from "@/components/AllShowsPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Shows — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function AdminShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  if (secret && provided !== secret) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
        <h1 className="text-xl font-medium">Not authorized</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/60">
          Append <code>?secret=…</code> to access the shows admin.
        </p>
      </main>
    );
  }

  const shows = await fetchAllShows();

  return <AllShowsPanel shows={shows} secret={secret ?? ""} />;
}
