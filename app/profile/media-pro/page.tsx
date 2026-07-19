import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import { getAllMediaPros } from "@/lib/mediaPros";
import MediaProLinkSearch from "@/components/MediaProLinkSearch";

export const metadata: Metadata = {
  title: "Are you a photographer or videographer? — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Entry point for finding or quick-adding a photo/video listing — mirrors
// app/profile/band/page.tsx. No one-listing-per-user rule (a user can end up
// an editor on several listings), so this never auto-redirects away.
export default async function MediaProLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNextPath(typeof sp.next === "string" ? sp.next : null) || undefined;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/profile/media-pro${next ? `?next=${next}` : ""}`)}`);
  }

  const mediaPros = await getAllMediaPros();
  const entries = mediaPros.map((mp) => ({ name: mp.name, slug: mp.slug }));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Are you a photographer or videographer?</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Find your listing in the directory, or add it if it&apos;s not there
        yet. Claim it to get edit access — an admin reviews each request.
      </p>
      <MediaProLinkSearch mediaPros={entries} next={next} loggedIn />
    </main>
  );
}
