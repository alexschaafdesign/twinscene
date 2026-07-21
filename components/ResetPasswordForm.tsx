"use client";

import Link from "next/link";
import { useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none";

/** Sets a new password from a reset link. Posts { token, password } to
 * /api/auth/reset; the token came in the emailed URL and is carried as a prop
 * from the /reset page. On success the API has both set the password and
 * started a session, so we hard-navigate to the profile signed in. */
export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Something went wrong. Try again in a moment.");
        setStatus("error");
        return;
      }
      // Password set and session started — land on the profile, signed in.
      window.location.assign("/profile");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3" noValidate>
      <label htmlFor="reset-password" className="sr-only">
        New password
      </label>
      <input
        id="reset-password"
        type="password"
        name="password"
        autoFocus
        autoComplete="new-password"
        required
        placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        aria-invalid={status === "error"}
        className={inputClass}
      />
      <label htmlFor="reset-confirm" className="sr-only">
        Confirm new password
      </label>
      <input
        id="reset-confirm"
        type="password"
        name="confirm"
        autoComplete="new-password"
        required
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        aria-invalid={status === "error"}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "submitting" ? "Saving…" : "Set new password"}
      </button>
      {status === "error" && (
        <div className="text-sm text-[#F5A3A3]">
          <p>{error}</p>
          <Link
            href="/forgot"
            className="underline underline-offset-2 transition hover:text-[#E8E0D0]"
          >
            Request a new reset link
          </Link>
        </div>
      )}
    </form>
  );
}
