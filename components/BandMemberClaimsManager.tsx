"use client";

import { useState } from "react";
import type { PendingBandMemberClaim } from "@/lib/bandMemberClaims";

// Approve/reject UI for pending band-member claims, shared by the admin
// oversight queue (app/admin/band-member-claims, decides via
// /api/admin/band-member-claims/[id]) and a band's own owner-facing list
// (decides via /api/bands/[slug]/member-claims/[id]) — `decideUrl` picks
// which. Approval on the server links musicians.user_id (if unlinked),
// ensures a band_members row, and grants band_editors role='member', all in
// one transaction (lib/bandMemberClaims.ts decideMemberClaim) — this
// component just reflects the result.
export default function BandMemberClaimsManager({
  initialClaims,
  decideUrl,
}: {
  initialClaims: PendingBandMemberClaim[];
  decideUrl: (claim: PendingBandMemberClaim) => string;
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [error, setError] = useState("");

  async function decide(claim: PendingBandMemberClaim, decision: "approve" | "reject") {
    setError("");
    try {
      const res = await fetch(decideUrl(claim), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
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
              {c.user_email} is <strong>{c.musician_name}</strong> in{" "}
              <strong>{c.band_name}</strong>
            </span>
            <span className="flex shrink-0 gap-3">
              <button onClick={() => decide(c, "approve")} className="hover:underline">
                Approve
              </button>
              <button
                onClick={() => decide(c, "reject")}
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
