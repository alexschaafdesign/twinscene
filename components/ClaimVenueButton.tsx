"use client";

import { useState } from "react";
import Link from "next/link";

// "Claim this venue" for an unclaimed/not-yet-editable venue profile. Opens a
// pending venue_claims row for an admin to review and approve at
// /admin/venue-claims. Mirrors ClaimMediaProButton.tsx.
export default function ClaimVenueButton({
  slug,
  loggedIn,
}: {
  slug: string;
  loggedIn: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/venues/${slug}`)}`}
        className="rounded-md border border-[#E8E0D0]/40 px-3.5 py-1.5 text-xs font-medium text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/10"
      >
        Log in to claim
      </Link>
    );
  }

  if (status === "sent") {
    return (
      <span className="text-xs text-[#E8E0D0]/60">
        Claim sent — an admin will review it.
      </span>
    );
  }

  async function handleClaim() {
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch(`/api/venues/${slug}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClaim}
        disabled={status === "submitting"}
        className="rounded-md border border-[#E8E0D0]/40 px-3.5 py-1.5 text-xs font-medium text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Claim this venue"}
      </button>
      {error && <span className="text-xs text-[#F5A3A3]">{error}</span>}
    </div>
  );
}
