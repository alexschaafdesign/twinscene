import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listPendingMusicianClaims } from "@/lib/musicianClaims";
import MusicianClaimsManager from "@/components/MusicianClaimsManager";

export const metadata: Metadata = {
  title: "Musician claims — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only review queue for musician claims. Gated on the users.is_admin
// session, same as /admin/claims.
export default async function MusicianClaimsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const claims = await listPendingMusicianClaims();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Pending musician claims</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Approving links the account to that musician and grants editor access
        to all of that musician&apos;s bands.
      </p>
      <MusicianClaimsManager initialClaims={claims} />
    </main>
  );
}
