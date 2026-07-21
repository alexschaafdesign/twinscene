import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listAllPendingClaims } from "@/lib/bandMemberClaims";
import BandMemberClaimsManager from "@/components/BandMemberClaimsManager";

export const metadata: Metadata = {
  title: "Edit-access requests — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only oversight queue for member edit-access requests. Musicians list
// themselves in a band instantly; this queue is only about who additionally
// gets edit access. Owners decide these on their own bands directly (the band
// page's "Members requesting edit access"); this page is the fallback for
// ownerless bands and general visibility — gated on the users.is_admin
// session, same as /admin/claims.
export default async function BandMemberClaimsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const claims = await listAllPendingClaims();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Pending edit-access requests</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Every pending request, across all bands. The musician is already
        listed in the band — granting here only gives that account editor
        access to the band. A band&apos;s own owner can also decide these
        directly from that band&apos;s page; this is the fallback for
        ownerless bands, plus general oversight.
      </p>
      <BandMemberClaimsManager initialClaims={claims} scope="admin" />
    </main>
  );
}
