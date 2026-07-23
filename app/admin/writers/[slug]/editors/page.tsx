import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getWriterBySlug } from "@/lib/writers";
import { listWriterEditors } from "@/lib/writerEditors";
import WriterEditorsManager from "@/components/WriterEditorsManager";

export const metadata: Metadata = {
  title: "Writer editors — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only page for assigning/revoking editor access to one writer profile.
// Mirrors app/admin/media-pros/[slug]/editors/page.tsx.
export default async function WriterEditorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const writer = await getWriterBySlug(slug);
  if (!writer) notFound();

  const editors = await listWriterEditors(writer.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Editors for {writer.name}</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Anyone listed here can edit this profile via its edit form, same as an admin.
      </p>
      <WriterEditorsManager slug={writer.slug} initialEditors={editors} />
    </main>
  );
}
