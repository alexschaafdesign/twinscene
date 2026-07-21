"use client";

import Link from "next/link";
import { useState } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none";

/** Requests a password-reset link (/api/auth/forgot). Always shows the same
 * "if that email has an account, a link is on its way" confirmation — the API
 * never reveals whether the address is registered. Also the on-ramp for
 * existing magic-link users to set a first password. */
export default function ForgotPasswordForm({ isDev = false }: { isDev?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Enter a valid email address");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Something went wrong. Try again in a moment.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6 flex flex-col gap-2">
        <p className="text-sm text-[#E8E0D0]/80">
          If that email has an account, a reset link is on its way — it expires in 15 minutes.
        </p>
        {isDev && (
          <p className="text-sm text-[#E8E0D0]/50">
            Dev mode: no email is sent — the link is printed to your server console instead.
          </p>
        )}
        <Link
          href="/login"
          className="mt-2 self-start text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3" noValidate>
      <label htmlFor="forgot-email" className="sr-only">
        Email address
      </label>
      <input
        id="forgot-email"
        type="email"
        name="email"
        autoFocus
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        aria-invalid={status === "error"}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Send reset link"}
      </button>
      {status === "error" && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <Link
        href="/login"
        className="self-start text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
      >
        Back to sign in
      </Link>
    </form>
  );
}
