"use client";

import { useState } from "react";

/** Email-entry form for /login — posts to /api/auth/login, then shows a "check your email" state. */
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
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

  if (status === "sent") {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/80">
        Check your email for a sign-in link. It expires in 15 minutes.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        name="email"
        autoFocus
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
      {status === "error" && <p className="text-sm text-[#F5A3A3]">{error}</p>}
    </form>
  );
}
