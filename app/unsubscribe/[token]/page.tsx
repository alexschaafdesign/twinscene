import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeMessageEmails } from "@/lib/users";

export const metadata: Metadata = {
  title: "Unsubscribe — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

// One-click, no-login unsubscribe from message emails. The footer link in every
// new-message email lands here; loading the page performs the opt-out (see
// lib/users unsubscribeMessageEmails — idempotent, so an email client that
// prefetches the link just no-ops on the second hit). A bad/unknown token shows
// the same generic result, leaking nothing about which tokens are real.
export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  const result = await unsubscribeMessageEmails(token);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-16 text-[#E8E0D0] sm:px-8">
      {result ? (
        <>
          <h1 className="text-xl font-medium">You&apos;re unsubscribed</h1>
          <p className="text-sm text-[#E8E0D0]/70">
            You won&apos;t get emails about new messages anymore. You&apos;ll
            still see them in your inbox on the site.
          </p>
          <p className="text-sm text-[#E8E0D0]/70">
            Changed your mind? Turn it back on any time under{" "}
            <Link href="/profile/edit" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Edit profile
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-medium">Link expired or invalid</h1>
          <p className="text-sm text-[#E8E0D0]/70">
            We couldn&apos;t process that unsubscribe link. You can manage email
            preferences directly under{" "}
            <Link href="/profile/edit" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Edit profile
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
