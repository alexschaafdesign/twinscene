import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import OnboardingInterestButton from "@/components/OnboardingInterestButton";

export const metadata: Metadata = {
  title: "Welcome to Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STEP_COPY: Record<"photographer" | "venue", { title: string; body: string }> = {
  photographer: {
    title: "Photography credits are coming soon",
    body: "We're building a way to credit photographers on show photos and band pages. Want us to let you know when it's ready?",
  },
  venue: {
    title: "Venue tools are coming soon",
    body: "We're building tools for venue owners and staff to manage their listing. Want us to let you know when it's ready?",
  },
};

// Guided onboarding, step 2 — the router between role-specific steps. `queue`
// is a comma-separated, fixed-order list of roles picked on step 1
// (app/welcome/page.tsx via components/OnboardingRoleForm.tsx). This page
// peels off the first role, dispatches to it, and carries the rest of the
// queue (plus the original `next`) forward as the "continue" target — either
// another /welcome/flow with a shorter queue, or app/welcome/done/page.tsx
// once the queue is empty.
//
// Musician and band steps reuse the existing standalone pages
// (app/profile/musician, app/profile/band) rather than duplicating their
// data-fetching and search UI — this page just redirects to them with `next`
// set to wherever the queue should continue.
export default async function OnboardingFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sp = await searchParams;
  const rawQueue = typeof sp.queue === "string" ? sp.queue : "";
  const queue = rawQueue.split(",").map((s) => s.trim()).filter(Boolean);
  const next = sanitizeNextPath(typeof sp.next === "string" ? sp.next : null) || "/";

  const [role, ...remaining] = queue;
  const doneUrl = `/welcome/done?next=${encodeURIComponent(next)}`;
  if (!role) {
    redirect(doneUrl);
  }

  const nextStepUrl =
    remaining.length > 0
      ? `/welcome/flow?queue=${remaining.join(",")}&next=${encodeURIComponent(next)}`
      : doneUrl;

  if (role === "musician") {
    redirect(`/profile/musician?next=${encodeURIComponent(nextStepUrl)}`);
  }
  if (role === "band") {
    redirect(`/profile/band?next=${encodeURIComponent(nextStepUrl)}`);
  }
  if (role !== "photographer" && role !== "venue") {
    // Unrecognized role (stale link, tampered query) — skip it rather than
    // getting stuck.
    redirect(nextStepUrl);
  }

  const copy = STEP_COPY[role];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8B84B]">
        Welcome to Twin Scene
      </span>
      <h1 className="mt-2 text-2xl font-medium">{copy.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#E8E0D0]/70">{copy.body}</p>
      <OnboardingInterestButton role={role} next={nextStepUrl} />
    </main>
  );
}
