"use client";

import { useState } from "react";
import type { PendingBandMemberClaim } from "@/lib/bandMemberClaims";

// Approve/reject UI for pending EDIT-ACCESS requests, shared by the admin
// oversight queue (app/admin/band-member-claims, decides via
// /api/admin/band-member-claims/[id]) and a band's own owner-facing list
// (decides via /api/bands/[slug]/member-claims/[id]) — `scope` picks which.
// The musician is already listed in the band (createMemberClaim did that on
// the spot); approving here grants band_editors role='member' — i.e. edit
// access — while rejecting just denies edit access and leaves the listing
// intact (lib/bandMemberClaims.ts decideMemberClaim). This component just
// reflects the result.
//
// `scope` is a plain string rather than a decideUrl(claim) callback because
// every server caller here is a Server Component, and a function prop can't
// cross that boundary — it throws "Functions cannot be passed directly to
// Client Components" the moment a claim exists to render.
type ClaimScope = "band" | "admin";

function decideUrl(scope: ClaimScope, claim: PendingBandMemberClaim): string {
  return scope === "admin"
    ? `/api/admin/band-member-claims/${claim.id}`
    : `/api/bands/${claim.band_slug}/member-claims/${claim.id}`;
}

export default function BandMemberClaimsManager({
  initialClaims,
  scope,
}: {
  initialClaims: PendingBandMemberClaim[];
  scope: ClaimScope;
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [error, setError] = useState("");

  async function decide(claim: PendingBandMemberClaim, decision: "approve" | "reject") {
    setError("");
    try {
      const res = await fetch(decideUrl(scope, claim), {
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
    return <p className="mt-6 text-sm text-[#E8E0D0]/50">No pending edit-access requests.</p>;
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
              {c.user_email} (<strong>{c.musician_name}</strong> in{" "}
              <strong>{c.band_name}</strong>) wants edit access
            </span>
            <span className="flex shrink-0 gap-3">
              <button onClick={() => decide(c, "approve")} className="hover:underline">
                Grant
              </button>
              <button
                onClick={() => decide(c, "reject")}
                className="text-[#F5A3A3] hover:underline"
              >
                Deny
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
