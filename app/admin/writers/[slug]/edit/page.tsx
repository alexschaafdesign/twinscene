import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, canEditWriter } from "@/lib/auth";
import { getWriterBySlug } from "@/lib/writers";
import WriterForm from "@/components/WriterForm";

export const metadata: Metadata = {
  title: "Edit writer — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Editable by an admin OR an assigned writer_editor (canEditWriter) — not
// admin-only, so a claimed writer can maintain their own page. The gate is the
// permission check, not the /admin path (docs/auth-and-db.md: never gate on
// hidden UI).
export default async function EditWriterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/writers/${slug}/edit`)}`);

  const writer = await getWriterBySlug(slug);
  if (!writer) notFound();

  if (!(await canEditWriter(user, writer.id))) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have edit access to this profile.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">Edit {writer.name}</h1>
      <WriterForm
        mode="edit"
        initial={{
          slug: writer.slug,
          name: writer.name,
          publication: writer.publication ?? "",
          city: writer.city ?? "",
          bio: writer.bio ?? "",
          website: writer.website ?? "",
          substackUrl: writer.substack_url ?? "",
          instagram: writer.instagram ?? "",
          twitter: writer.twitter ?? "",
          contact: writer.contact ?? "",
          photoUrl: writer.photo ?? "",
        }}
      />
    </main>
  );
}
