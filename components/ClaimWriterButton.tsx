"use client";

import { useState } from "react";
import Link from "next/link";

// "Claim this profile" for an unclaimed/not-yet-editable writer page. Opens a
// pending writer_claims row for an admin to review at /admin/writer-claims —
// mirrors ClaimMediaProButton exactly.
export default function ClaimWriterButton({
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
        href={`/login?next=${encodeURIComponent(`/writers/${slug}`)}`}
        className="rounded-md border border-[#E8E0D0]/40 px-3.5 py-1.5 text-xs font-medium text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/10"
      >
        Log in to claim
      </Link>
    );
  }

  if (status === "sent") {
    return <span className="text-xs text-[#E8E0D0]/60">Claim sent — an admin will review it.</span>;
  }

  async function handleClaim() {
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch(`/api/writers/${slug}/claim`, { method: "POST" });
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
        {status === "submitting" ? "Sending…" : "Claim this profile"}
      </button>
      {error && <span className="text-xs text-[#F5A3A3]">{error}</span>}
    </div>
  );
}
