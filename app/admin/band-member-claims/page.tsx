import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listAllPendingClaims } from "@/lib/bandMemberClaims";
import BandMemberClaimsManager from "@/components/BandMemberClaimsManager";

export const metadata: Metadata = {
  title: "Band member claims — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only oversight queue for band-member claims. Owners decide claims on
// their own bands directly (the band page's "Pending member requests"); this
// page exists as a fallback for ownerless bands and general visibility —
// gated on the users.is_admin session, same as /admin/claims.
export default async function BandMemberClaimsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const claims = await listAllPendingClaims();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <h1 className="text-xl font-medium">Pending band member claims</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Every pending claim, across all bands. A band&apos;s own owner can
        also decide claims directly from that band&apos;s page — this is the
        fallback for ownerless bands, plus general oversight. Approving
        links the account to that musician, adds them to the band&apos;s
        member list, and grants them editor access to that band.
      </p>
      <BandMemberClaimsManager
        initialClaims={claims}
        decideUrl={(claim) => `/api/admin/band-member-claims/${claim.id}`}
      />
    </main>
  );
}
