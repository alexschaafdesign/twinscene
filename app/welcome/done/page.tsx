import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Welcome to Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Closing step of the guided onboarding flow (app/welcome/page.tsx +
// app/welcome/flow/page.tsx) — everyone lands here eventually, whether they
// stepped through role-specific steps or skipped straight past ("just
// browsing"). Content is the orientation the old static /welcome page used
// to show; kept generic rather than role-aware for now.
export default async function OnboardingDonePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sp = await searchParams;
  const next = sanitizeNextPath(typeof sp.next === "string" ? sp.next : null) || "/";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8B84B]">
        Welcome to Twin Scene
      </span>
      <h1 className="mt-2 text-2xl font-medium">You&apos;re all set 🎉</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#E8E0D0]/70">
        Your account is ready — you signed in with just your email, so there&apos;s
        no password to remember. Next time, the same link gets you back in. Here
        are a few things you can do now:
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        <li className="rounded-md border border-[#E8E0D0]/15 px-4 py-3">
          <p className="text-sm font-medium text-[#E8E0D0]">Save &amp; follow bands</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#E8E0D0]/65">
            Save bands you love and follow them to keep their upcoming shows on
            your radar — it all lives on{" "}
            <Link href="/profile" className="underline hover:text-[#E8E0D0]">
              your profile
            </Link>
            .
          </p>
        </li>
        <li className="rounded-md border border-[#E8E0D0]/15 px-4 py-3">
          <p className="text-sm font-medium text-[#E8E0D0]">Claim your band</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#E8E0D0]/65">
            In a band that&apos;s on here? Open its page and hit{" "}
            <span className="text-[#E8E0D0]">&ldquo;I own this band&rdquo;</span>{" "}
            — we&apos;ll verify it&apos;s really you over Instagram, then hand you
            the keys to edit the page.
          </p>
        </li>
        <li className="rounded-md border border-[#E8E0D0]/15 px-4 py-3">
          <p className="text-sm font-medium text-[#E8E0D0]">Make it yours</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#E8E0D0]/65">
            Add a name, photo, and username in{" "}
            <Link href="/profile/edit" className="underline hover:text-[#E8E0D0]">
              profile settings
            </Link>{" "}
            to get a public profile others can find.
          </p>
        </li>
      </ul>

      <Link
        href={next}
        className="mt-6 inline-flex items-center gap-1 self-start rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
      >
        Get started
      </Link>

      <p className="mt-4 text-[13px] text-[#E8E0D0]/50">
        Questions or ideas? Email alex@thebirdhaus.org anytime.
      </p>
    </main>
  );
}
