import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import RedeemCodeForm from "@/components/RedeemCodeForm";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Redeem an ownership code — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Logged-in-only page for redeeming a band-ownership code sent via Instagram
// DM. See lib/bandOwnership.ts for the redeem logic.
export default async function RedeemPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/redeem");
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <BackLink href="/profile" label="Profile" className="mb-6" />
      <h1 className="text-xl font-medium">Redeem an ownership code</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        If an admin sent you a code over Instagram DM, enter it below to claim
        ownership of your band&apos;s page.
      </p>
      <RedeemCodeForm />
    </main>
  );
}
