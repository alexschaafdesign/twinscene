import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listPendingClaims } from "@/lib/writerClaims";
import WriterClaimsManager from "@/components/WriterClaimsManager";

export const metadata: Metadata = {
  title: "Writer claims — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Admin-only review queue for writer self-editing claims. Mirrors
// app/admin/media-pro-claims/page.tsx.
export default async function WriterClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const claims = await listPendingClaims();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Pending writer claims</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Approving grants the requester editor access to that writer profile.
      </p>
      <WriterClaimsManager initialClaims={claims} />
    </main>
  );
}
