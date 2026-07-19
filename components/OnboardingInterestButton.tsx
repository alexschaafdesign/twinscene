"use client";

import { useState } from "react";
import Link from "next/link";
import type { OnboardingInterestRole } from "@/lib/onboardingInterest";

// "Notify me" for onboarding roles with no feature behind them yet
// (photographer, venue) — see app/api/onboarding/interest/route.ts and
// migration 0029. Idempotent server-side, so re-clicking on a revisit is
// harmless.
export default function OnboardingInterestButton({
  role,
  next,
}: {
  role: OnboardingInterestRole;
  next: string;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function notify() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6">
        <p className="text-sm text-[#E8E0D0]/80">We&apos;ll let you know when it&apos;s ready.</p>
        <Link
          href={next}
          className="mt-3 inline-block text-sm font-medium text-[#E8E0D0] underline underline-offset-2 hover:text-[#E8B84B]"
        >
          Continue
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-4">
      <button
        type="button"
        onClick={notify}
        disabled={submitting}
        className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white disabled:opacity-40"
      >
        Notify me when it&apos;s ready
      </button>
      <Link href={next} className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]">
        Skip for now
      </Link>
      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
