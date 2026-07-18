import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSavedBands } from "@/lib/savedBands";
import SavedBandsList from "@/components/SavedBandsList";

export const metadata: Metadata = {
  title: "My saved bands — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Logged-in-only "My saved bands" page — slice 1 of Phase 3. Follows and show
// attendance get their own sections here in later slices.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile");
  }

  const bands = await listSavedBands(user.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">My saved bands</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Bands you&apos;ve saved from the directory.
      </p>
      <SavedBandsList initialBands={bands} />
    </main>
  );
}
