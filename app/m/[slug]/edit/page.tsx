import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMusicianBySlug, canEditMusician } from "@/lib/musicians";
import MusicianEditForm from "@/components/MusicianEditForm";

export const metadata: Metadata = {
  title: "Edit musician — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function MusicianEditPage({ params }: Props) {
  const { slug } = await params;
  const musician = await getMusicianBySlug(slug);
  if (!musician) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/m/${slug}/edit`);
  }
  if (!(await canEditMusician(user, musician.id))) {
    redirect(`/m/${slug}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <Link
        href={`/m/${slug}`}
        className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
      >
        Back to musician page
      </Link>
      <h1 className="mt-4 text-xl font-medium">Edit musician</h1>
      <MusicianEditForm
        slug={musician.slug}
        musician={{ name: musician.name, bio: musician.bio, image_url: musician.image_url }}
      />
    </main>
  );
}
