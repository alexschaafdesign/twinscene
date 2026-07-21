"use client";

import { useEffect, useState } from "react";
import BetaAlert from "@/components/BetaAlert";

const STORAGE_KEY = "beta-alert-dismissed";

// The intro row above the band grid — now just the dismissible beta explainer.
// (The logged-out sign-in card that used to sit beside it is gone; sign-in
// lives in the header's "Sign up / log in" button.) Renders nothing once the
// beta notice is dismissed, rather than leaving an empty, margined wrapper that
// pushed the band grid down.
export default function HomeIntroRow() {
  const [betaVisible, setBetaVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setBetaVisible(true);
    }
  }, []);

  if (!betaVisible) return null;

  return (
    <div className="mb-6">
      <BetaAlert
        onDismiss={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setBetaVisible(false);
        }}
      />
    </div>
  );
}
