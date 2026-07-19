"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Optional nudge on /profile/musician when users.name is unset — the search
// box above works without a name, but findMusicianNameMatches (the "is this
// you?" suggestions) needs one to match against. Saves via the existing
// profile PATCH route (same one app/profile/edit uses) and refreshes the
// server component so the page picks up the new name and re-runs
// findMusicianNameMatches.
export default function MusicianNamePrompt() {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-md border border-[#E8E0D0]/15 px-3.5 py-3">
      <p className="text-sm text-[#E8E0D0]/80">
        Don&apos;t see yourself above? Tell us your name and we&apos;ll check
        for an exact match.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-md border border-[#E8E0D0]/25 px-3.5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:opacity-40"
        >
          Continue
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
