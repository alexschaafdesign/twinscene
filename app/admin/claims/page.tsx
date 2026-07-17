import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listPendingClaims } from "@/lib/bandClaims";
import ClaimsManager from "@/components/ClaimsManager";

export const metadata: Metadata = {
  title: "Band claims — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only review queue for band self-editing claims. Gated on the
// users.is_admin session, same as /admin/bands/[slug]/editors.
export default async function ClaimsPage() {
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

  const claims = await listPendingClaims();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Pending band claims</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Approving grants the requester editor access to that band.
      </p>
      <ClaimsManager initialClaims={claims} />
    </main>
  );
}
