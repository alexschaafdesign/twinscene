"use client";

import { useEffect, useState } from "react";
import LoginForm from "@/components/LoginForm";
import BetaAlert from "@/components/BetaAlert";

const STORAGE_KEY = "beta-alert-dismissed";

// The intro row above the band grid: the beta explainer, plus a sign-in
// card for logged-out visitors. Logged-in visitors never get a sign-in
// card, so once they've dismissed the beta notice there's nothing left to
// show — this renders nothing at all rather than leaving an empty,
// margined wrapper behind (which was pushing the band grid down).
export default function HomeIntroRow({
  loggedIn,
  isDev,
}: {
  loggedIn: boolean;
  isDev: boolean;
}) {
  const [betaVisible, setBetaVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setBetaVisible(true);
    }
  }, []);

  if (loggedIn && !betaVisible) return null;

  return (
    <div
      className={`mb-6 grid items-start gap-4 ${loggedIn ? "" : "sm:grid-cols-2"}`}
    >
      {betaVisible && (
        <BetaAlert
          onDismiss={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setBetaVisible(false);
          }}
        />
      )}

      {!loggedIn && (
        <div className="rounded-md border border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.03] px-4 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]">
            Sign up or log in
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#E8E0D0]/70">
            New here or coming back — it&apos;s the same step. Drop in your
            email and we&apos;ll send a one-tap login link. No password, no
            signup form; if you don&apos;t have an account yet, the link
            creates one.
          </p>
          <LoginForm isDev={isDev} autoFocus={false} />
        </div>
      )}
    </div>
  );
}
