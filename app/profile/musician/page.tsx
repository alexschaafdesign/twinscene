import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
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
// self-serve create a new one. If the user's name isn't set yet, prompts for
// it first so findMusicianNameMatches can suggest "is this you?" matches.
// Redirects away if the user is already linked, since one user ↔ at most one
// musician.
export default async function MusicianLinkPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile/musician");
  }

  const existing = await getMusicianForUser(user.id);
  if (existing) {
    redirect("/profile");
  }

  const [musicians, nameMatches]: [MusicianEntry[], MusicianNameSuggestion[]] = user.name
    ? await Promise.all([fetchMusiciansDirectory(), findMusicianNameMatches(user.name, user.id)])
    : [[], []];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
      >
        <span aria-hidden>←</span> Profile
      </Link>
      <h1 className="mt-6 text-xl font-medium">Are you a musician?</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Find yourself in the musician directory and claim it, or create a new
        profile if you&apos;re not listed yet. Claiming an existing musician
        needs a quick review from that band&apos;s owner; once approved
        you&apos;ll be able to edit that band.
      </p>
      {user.name ? (
        <MusicianLinkSearch musicians={musicians} nameMatches={nameMatches} />
      ) : (
        <MusicianNamePrompt />
      )}
    </main>
  );
}
