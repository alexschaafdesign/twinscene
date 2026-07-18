"use client";

import { useState } from "react";
import type { PendingMusicianClaim } from "@/lib/musicianClaims";

// Minimal admin approve/reject UI for pending musician claims. Approval on
// the server links musicians.user_id AND grants band_editors for every band
// the musician is in, in one transaction (lib/musicianClaims.ts
// decideMusicianClaim) — this component just reflects the result.
export default function MusicianClaimsManager({
  initialClaims,
}: {
  initialClaims: PendingMusicianClaim[];
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [error, setError] = useState("");

  async function decide(id: number, decision: "approve" | "reject") {
    setError("");
    try {
      const res = await fetch(`/api/admin/musician-claims/${id}`, {
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
              {c.user_email} is <strong>{c.musician_name}</strong>
              {c.bands.length > 0 && (
                <span className="text-[#E8E0D0]/50">
                  {" "}
                  ({c.bands.map((b) => b.name).join(", ")})
                </span>
              )}
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
