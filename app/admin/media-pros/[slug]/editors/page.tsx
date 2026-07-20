import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getMediaProBySlug } from "@/lib/mediaPros";
import { listMediaProEditors } from "@/lib/mediaProEditors";
import MediaProEditorsManager from "@/components/MediaProEditorsManager";

export const metadata: Metadata = {
  title: "Photo/video editors — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only page for assigning/revoking editor access to one media pro
// listing. Gated on the users.is_admin session, same as the API routes it
// calls. Mirrors app/admin/bands/[slug]/editors/page.tsx.
export default async function MediaProEditorsPage({
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
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const mediaPro = await getMediaProBySlug(slug);
  if (!mediaPro) {
    notFound();
  }

  const editors = await listMediaProEditors(mediaPro.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <h1 className="text-xl font-medium">Editors for {mediaPro.name}</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Anyone listed here can edit this listing via its public edit form,
        same as an admin.
      </p>
      <MediaProEditorsManager slug={mediaPro.slug} initialEditors={editors} />
    </main>
  );
}
