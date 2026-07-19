import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import OnboardingRoleForm from "@/components/OnboardingRoleForm";

export const metadata: Metadata = {
  title: "Welcome to Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Guided onboarding, step 1 — shown right after a first-ever sign-in (the
// login callback routes brand-new accounts here — see
// app/api/auth/callback/route.ts) but also safe to revisit any time; nothing
// marks it "seen" or blocks re-entry. "Who are you?" is multi-select (a
// person can be both a musician and a venue employee), and picking nothing
// just skips ahead — this never gates access to the rest of the site.
// Continuing hands off to app/welcome/flow/page.tsx, which steps through one
// screen per selected role, then app/welcome/done/page.tsx.
export default async function WelcomePage({
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
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8B84B]">
        Welcome to Twin Scene
      </span>
      <h1 className="mt-2 text-2xl font-medium">Who are you?</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#E8E0D0]/70">
        Check anything that applies — we&apos;ll help you find or set up the
        right profile for each. Not sure yet, or just here to browse? Hit
        continue and skip straight in.
      </p>

      <OnboardingRoleForm next={next} />
    </main>
  );
}
