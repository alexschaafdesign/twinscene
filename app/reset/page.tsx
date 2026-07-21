import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password — Twin Scene",
  robots: { index: false, follow: false },
};

// Landing page for the emailed reset link. The raw token rides in the URL; the
// token isn't verified until the form posts it to /api/auth/reset (so a stale
// link only fails on submit, with a clear "request a new one" path). No token
// at all → a friendly nudge back to /forgot.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Set a new password</h1>
      {token ? (
        <>
          <p className="mt-2 text-sm text-[#E8E0D0]/60">
            Choose a new password for your Twin Scene account. You&apos;ll be signed in once it&apos;s saved.
          </p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-3 text-sm text-[#F5A3A3]">
          This reset link is missing its token or has expired.{" "}
          <Link href="/forgot" className="underline underline-offset-2 hover:text-[#E8E0D0]">
            Request a new one
          </Link>
          .
        </p>
      )}
    </main>
  );
}
