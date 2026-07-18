"use client";

import { useState } from "react";
import Link from "next/link";
import type { FollowedBand } from "@/lib/bandFollows";

// "Bands you follow" list on /profile — same shape/pattern as SavedBandsList.
// Unfollow removes the row immediately (server delete is idempotent — see
// lib/bandFollows.ts — so a slow/duplicate click can't error), reverting the
// list if the request fails.
export default function FollowedBandsList({ initialBands }: { initialBands: FollowedBand[] }) {
  const [bands, setBands] = useState(initialBands);
  const [error, setError] = useState("");

  async function unfollow(slug: string) {
    setError("");
    const prev = bands;
    setBands((cur) => cur.filter((b) => b.slug !== slug));
    try {
      const res = await fetch(`/api/bands/${slug}/follow`, { method: "DELETE" });
      if (!res.ok) throw new Error(`unfollow failed (${res.status})`);
    } catch {
      setError("Something went wrong — try again.");
      setBands(prev);
    }
  }

  if (bands.length === 0) {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/50">
        Not following any bands yet. Find one on the{" "}
        <Link href="/" className="underline underline-offset-2 hover:text-[#E8E0D0]">
          directory
        </Link>{" "}
        and follow it.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <ul className="flex flex-col gap-2">
        {bands.map((b) => (
          <li
            key={b.band_id}
            className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
          >
            <Link href={`/bands/${b.slug}`} className="hover:underline">
              {b.name}
              {b.city && <span className="text-[#E8E0D0]/50"> — {b.city}</span>}
            </Link>
            <button
              type="button"
              onClick={() => unfollow(b.slug)}
              className="text-[#E8E0D0]/60 transition hover:text-[#F5A3A3]"
            >
              Unfollow
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
