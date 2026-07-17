import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { listBandEditors } from "@/lib/bandEditors";
import BandEditorsManager from "@/components/BandEditorsManager";

export const metadata: Metadata = {
  title: "Band editors — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only page for assigning/revoking editor access to one band. Gated on
// the users.is_admin session (lib/auth.ts), same as the API routes it calls
// — not the older SCRAPE_SECRET cookie the rest of /admin uses.
export default async function BandEditorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const band = await getBandBySlug(slug);
  if (!band) {
    notFound();
  }

  const editors = await listBandEditors(band.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Editors for {band.name}</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Anyone listed here can edit this band via its public edit form, same as an admin.
      </p>
      <BandEditorsManager slug={band.slug} initialEditors={editors} />
    </main>
  );
}
