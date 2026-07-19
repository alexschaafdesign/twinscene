import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import {
  fetchMusiciansDirectory,
  getMusicianForUser,
  findMusicianNameMatches,
  type MusicianEntry,
  type MusicianNameSuggestion,
} from "@/lib/musicians";
import MusicianLinkSearch from "@/components/MusicianLinkSearch";
import MusicianNamePrompt from "@/components/MusicianNamePrompt";

export const metadata: Metadata = {
  title: "Are you a musician? — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Entry point for linking a user to a musician identity — claim an existing
// musician (reviewed by each of its bands' owners, band-scoped, Slice B) or
// self-serve create a new one. The search box is always available, same as
// /profile/band's — it used to be hidden behind a "what's your name?" gate
// (findMusicianNameMatches needs a name to suggest "is this you?" matches),
// which meant a user with no name set yet saw no search UI at all. Now the
// directory always loads; the name prompt is just an optional nudge below
// the search box for the (skippable) name-match suggestions. Redirects away
// if the user is already linked, since one user ↔ at most one musician — to
// `next` when present (the guided onboarding flow threads its queue through
// here, app/welcome/flow/page.tsx) so an already-linked user skips straight
// through instead of dead-ending on /profile.
export default async function MusicianLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNextPath(typeof sp.next === "string" ? sp.next : null) || undefined;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/profile/musician${next ? `?next=${next}` : ""}`)}`);
  }

  const existing = await getMusicianForUser(user.id);
  if (existing) {
    redirect(next || "/profile");
  }

  const [musicians, nameMatches]: [MusicianEntry[], MusicianNameSuggestion[]] = await Promise.all([
    fetchMusiciansDirectory(),
    user.name ? findMusicianNameMatches(user.name, user.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Are you a musician?</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Find yourself in the musician directory and claim it, or create a new
        profile if you&apos;re not listed yet. Claiming an existing musician
        needs a quick review from that band&apos;s owner; once approved
        you&apos;ll be able to edit that band.
      </p>
      <MusicianLinkSearch musicians={musicians} nameMatches={nameMatches} next={next} />
      {!user.name && <MusicianNamePrompt />}
    </main>
  );
}
