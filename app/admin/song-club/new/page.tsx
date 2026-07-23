import type { Metadata } from "next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import SongClubEventForm from "@/components/SongClubEventForm";

export const metadata: Metadata = {
  title: "New meetup — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewSongClubEventPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">New meetup</h1>
      <SongClubEventForm mode="add" />
    </main>
  );
}
