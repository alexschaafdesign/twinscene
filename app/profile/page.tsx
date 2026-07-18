import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSavedBands } from "@/lib/savedBands";
import { listFollowedBands } from "@/lib/bandFollows";
import { listUpcomingForUser, listAttended } from "@/lib/showSaves";
import SavedBandsList from "@/components/SavedBandsList";
import FollowedBandsList from "@/components/FollowedBandsList";
import UpcomingShowsList from "@/components/UpcomingShowsList";
import AttendedShowsList from "@/components/AttendedShowsList";

export const metadata: Metadata = {
  title: "My profile — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Logged-in-only profile page — saved bands (slice 1) plus follows and show
// attendance (slice 2 of Phase 3).
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile");
  }

  const [savedBands, followedBands, upcomingShows, attendedShows] = await Promise.all([
    listSavedBands(user.id),
    listFollowedBands(user.id),
    listUpcomingForUser(user.id),
    listAttended(user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 py-24 text-[#E8E0D0] sm:px-8">
      <div>
        <h1 className="text-xl font-medium">My saved bands</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Bands you&apos;ve saved from the directory.
        </p>
        <SavedBandsList initialBands={savedBands} />
      </div>

      <div>
        <h2 className="text-xl font-medium">Bands you follow</h2>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Bands you&apos;re keeping up with.
        </p>
        <FollowedBandsList initialBands={followedBands} />
      </div>

      <div>
        <h2 className="text-xl font-medium">Shows you&apos;re going to</h2>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Shows you&apos;ve marked interested or going.
        </p>
        <UpcomingShowsList initialShows={upcomingShows} />
      </div>

      <div>
        <h2 className="text-xl font-medium">Shows you&apos;ve been to</h2>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Your show history.
        </p>
        <AttendedShowsList initialShows={attendedShows} />
      </div>
    </main>
  );
}
