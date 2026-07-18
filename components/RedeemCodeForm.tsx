"use client";

import { useState } from "react";
import Link from "next/link";

// Logged-in-only form: submit a DM'd code, get ownership of the band it was
// issued for. Gating on login happens at the /redeem page (redirects to
// /login?next=/redeem); the API route re-checks server-side regardless.
export default function RedeemCodeForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [band, setBand] = useState<{ slug: string; name: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/ownership/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setBand(data.band);
      setStatus("done");
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done" && band) {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/80">
        You now own <strong>{band.name}</strong>.{" "}
        <Link href={`/bands/${band.slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
          Edit its page
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mt-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          required
          placeholder="Enter your code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
        >
          {status === "saving" ? "Redeeming…" : "Redeem"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
