"use client";

import { useState } from "react";
import Link from "next/link";
import type { BandMusician } from "@/lib/musicians";

type Result = { status: "pending" | "error"; message: string };

/**
 * "Are you in this band?" entry point on a band's page — claim one of the
 * listed members ("Is this you?") or add yourself under a new name. Listing
 * is instant (lib/bandMemberClaims.ts createMemberClaim links the musician and
 * inserts the band_members row on the spot); it also opens a pending request
 * for EDIT ACCESS that the band's owner (or an admin, for ownerless bands) can
 * later approve. Shown to logged-in visitors who don't already have edit access.
 */
export default function BandMemberClaimSection({
  bandSlug,
  members,
  loggedIn,
}: {
  bandSlug: string;
  members: BandMusician[];
  loggedIn: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loggedIn) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
          Are you in this band?
        </h2>
        <Link
          href={`/login?next=${encodeURIComponent(`/bands/${bandSlug}`)}`}
          className="text-sm text-[#E8E0D0]/70 underline underline-offset-2 hover:text-[#E8E0D0]"
        >
          Log in to claim your spot
        </Link>
      </div>
    );
  }

  async function submitClaim(body: { musicianId: number } | { name: string }) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bands/${bandSlug}/member-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResult({ status: "error", message: data.error || "Something went wrong" });
        return;
      }
      setResult({
        status: "pending",
        message: "You're now listed as a member of this band. An owner can grant you edit access.",
      });
    } catch {
      setResult({ status: "error", message: "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
          Are you in this band?
        </h2>
        <p className={`text-sm ${result.status === "error" ? "text-[#F5A3A3]" : "text-[#E8E0D0]/70"}`}>
          {result.message}
        </p>
        {result.status === "error" && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-1 text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Are you in this band?
      </h2>

      {members.length > 0 && !requesting && (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
            >
              <span>Is this you? {m.name}</span>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitClaim({ musicianId: m.id })}
                className="shrink-0 text-[#E8E0D0]/80 hover:underline disabled:opacity-40"
              >
                Claim
              </button>
            </li>
          ))}
        </ul>
      )}

      {!requesting ? (
        <button
          type="button"
          onClick={() => setRequesting(true)}
          className="mt-2 text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
        >
          Not listed? Add yourself as a member
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) submitClaim({ name: trimmed });
          }}
          className="mt-2 flex gap-2"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md border border-[#E8E0D0]/25 px-3.5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:opacity-40"
          >
            Request
          </button>
        </form>
      )}
    </div>
  );
}
