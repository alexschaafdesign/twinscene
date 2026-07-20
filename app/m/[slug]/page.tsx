import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMusicianPageData, canEditMusician } from "@/lib/musicians";
import BackLink from "@/components/BackLink";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const musician = await getMusicianPageData(slug);
  if (!musician) return {};

  // Musicians are public scene data — no noindex, unlike private user
  // profiles.
  return {
    title: `${musician.name} — Twin Scene`,
    description: musician.bio || `${musician.name} on Twin Scene.`,
  };
}

// Public, unauthenticated musician page — name, avatar, bio, and the bands
// they play in. getMusicianPageData only attaches a linkedUser when the
// linked account's profile_public is true, so a private/unlinked account
// never leaks a /u/[username] link here.
export default async function MusicianPage({ params }: Props) {
  const { slug } = await params;
  const musician = await getMusicianPageData(slug);
  if (!musician) notFound();

  const currentUser = await getCurrentUser();
  const canEdit = await canEditMusician(currentUser, musician.id);

  const initial = (musician.name.trim()[0] || "?").toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <BackLink href="/musicians" label="Musicians" />
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-lg font-medium text-[#E8E0D0]">
          {musician.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={musician.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{musician.name}</p>
          {musician.linkedUser && (
            <Link
              href={`/u/${musician.linkedUser.username}`}
              className="text-sm text-[#E8E0D0]/50 underline underline-offset-2 transition hover:text-[#E8E0D0]/80"
            >
              on Twin Scene as @{musician.linkedUser.username}
            </Link>
          )}
          {musician.bio && <p className="mt-1 text-sm text-[#E8E0D0]/80">{musician.bio}</p>}
          {canEdit && (
            <Link
              href={`/m/${musician.slug}/edit`}
              className="mt-2 inline-block text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-medium">Bands</h2>
        {musician.bands.length === 0 ? (
          <p className="mt-4 text-sm text-[#E8E0D0]/50">Not currently listed in any band.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {musician.bands.map((b) => (
              <li key={b.slug} className="rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm">
                <Link href={`/bands/${b.slug}`} className="hover:underline">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
