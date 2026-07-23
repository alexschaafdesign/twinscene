import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getComradeBySlug } from "@/lib/comrades";
import { listComradeEditors } from "@/lib/comradeEditors";
import ComradeEditorsManager from "@/components/ComradeEditorsManager";

export const metadata: Metadata = {
  title: "Comrade editors — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only page for assigning/revoking editor access to one comrade
// listing. Gated on the users.is_admin session, same as the API routes it
// calls. Mirrors app/admin/media-pros/[slug]/editors/page.tsx.
export default async function ComradeEditorsPage({
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
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const comrade = await getComradeBySlug(slug);
  if (!comrade) {
    notFound();
  }

  const editors = await listComradeEditors(comrade.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Editors for {comrade.name}</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Anyone listed here can edit this listing via its public edit form,
        same as an admin.
      </p>
      <ComradeEditorsManager slug={comrade.slug} initialEditors={editors} />
    </main>
  );
}
