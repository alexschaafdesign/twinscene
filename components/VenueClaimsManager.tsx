"use client";

import { useState } from "react";
import type { PendingVenueClaim } from "@/lib/venueClaims";

// Minimal admin approve/reject UI for pending venue claims. Approval on the
// server inserts the venue_editors row and marks the claim decided in one
// transaction (lib/venueClaims.ts decideClaim). Mirrors
// MediaProClaimsManager.tsx.
export default function VenueClaimsManager({
  initialClaims,
}: {
  initialClaims: PendingVenueClaim[];
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [error, setError] = useState("");

  async function decide(id: number, decision: "approve" | "reject") {
    setError("");
    try {
      const res = await fetch(`/api/admin/venue-claims/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      setClaims((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Something went wrong");
    }
  }

  if (claims.length === 0) {
    return <p className="mt-6 text-sm text-[#E8E0D0]/50">No pending claims.</p>;
  }

  return (
    <div className="mt-6">
      <ul className="flex flex-col gap-2">
        {claims.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
          >
            <span>
              {c.user_email} wants to edit <strong>{c.venue_name}</strong>
            </span>
            <span className="flex gap-3">
              <button onClick={() => decide(c.id, "approve")} className="hover:underline">
                Approve
              </button>
              <button
                onClick={() => decide(c.id, "reject")}
                className="text-[#F5A3A3] hover:underline"
              >
                Reject
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
