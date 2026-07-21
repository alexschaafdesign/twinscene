"use client";

import Link from "next/link";
import { useState } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none";

/** Email + password sign-in / sign-up, the alternative to the magic-link form
 * on /login. One panel, two modes:
 *  - "signin"  posts /api/auth/password-login → on success navigates to `next`.
 *  - "signup"  posts /api/auth/signup → shows a "check your email to verify"
 *              state (a new account can't log in until the email is confirmed).
 * A full-page navigation (not router.push) is used on sign-in success so the
 * server components re-render with the freshly set session cookie. */
export default function PasswordAuthForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address");
      setStatus("error");
      return;
    }
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      setStatus("error");
      return;
    }
    if (!password) {
      setError("Enter your password");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/password-login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Something went wrong. Try again in a moment.");
        setStatus("error");
        return;
      }
      if (isSignup) {
        setStatus("sent");
      } else {
        // Hard navigation so server components pick up the new session cookie.
        window.location.assign(next || "/");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (isSignup && status === "sent") {
    return (
      <div className="mt-6 flex flex-col gap-2">
        <p className="text-sm text-[#E8E0D0]/80">
          Almost there — check your email for a link to confirm your address. You&apos;ll be
          signed in once you click it.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setMode("signin");
          }}
          className="mt-2 self-start text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3" noValidate>
      <label htmlFor="auth-email" className="sr-only">
        Email address
      </label>
      <input
        id="auth-email"
        type="email"
        name="email"
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
      <label htmlFor="auth-password" className="sr-only">
        Password
      </label>
      <input
        id="auth-password"
        type="password"
        name="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        required
        placeholder={isSignup ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : "Password"}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
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
        {status === "submitting"
          ? isSignup
            ? "Creating account…"
            : "Signing in…"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </button>
      {status === "error" && <p className="text-sm text-[#F5A3A3]">{error}</p>}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-[#E8E0D0]/60">
        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            setStatus("idle");
            setError("");
          }}
          className="underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          {isSignup ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
        {!isSignup && (
          <Link
            href={next ? `/forgot?next=${encodeURIComponent(next)}` : "/forgot"}
            className="underline underline-offset-2 transition hover:text-[#E8E0D0]"
          >
            Forgot password?
          </Link>
        )}
      </div>
    </form>
  );
}
