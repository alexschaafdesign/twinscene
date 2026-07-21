"use client";

import { useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none";

/** Set or change your password from /profile/edit. When you already have one,
 * changing it requires the current password; setting a first password (you've
 * only ever used email links) needs no current password. Posts to
 * /api/auth/password, which enforces the same rule server-side. */
export default function PasswordSettings({ hasPassword: initialHasPassword }: { hasPassword: boolean }) {
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "saved" | "error">("idle");
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
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, currentPassword: hasPassword ? currentPassword : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Something went wrong. Try again in a moment.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setHasPassword(true);
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <section className="mt-10 border-t border-[#E8E0D0]/15 pt-8">
      <h2 className="text-lg font-medium">{hasPassword ? "Change password" : "Set a password"}</h2>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        {hasPassword
          ? "Update the password you use to sign in."
          : "Add a password so you can sign in without waiting for an email link. Email links keep working either way."}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3" noValidate>
        {hasPassword && (
          <>
            <label htmlFor="current-password" className="sr-only">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (status !== "idle") setStatus("idle");
              }}
              className={inputClass}
            />
          </>
        )}
        <label htmlFor="new-password" className="sr-only">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          className={inputClass}
        />
        <label htmlFor="confirm-password" className="sr-only">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="self-start rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
        >
          {status === "submitting" ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </button>
        {status === "saved" && <p className="text-sm text-[#9FD3A0]">Password updated.</p>}
        {status === "error" && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      </form>
    </section>
  );
}
