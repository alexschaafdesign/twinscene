"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_HIDE_MS = 4000;

/** Shown on /profile right after a redirect from /profile/edit (?saved=1).
 * Strips the query param immediately so a refresh or back-navigation doesn't
 * re-trigger it, then self-dismisses after a few seconds. */
export default function SavedBanner({ show }: { show: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;
    router.replace("/profile", { scroll: false });
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // Mount-only: `show` reflects the initial ?saved=1 param, which the
    // router.replace above strips, so re-running this on prop change would
    // clear the timer before it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="rounded-md border border-[#9FD3A0]/40 bg-[#9FD3A0]/10 px-4 py-3 text-sm text-[#9FD3A0]"
    >
      Changes made
    </div>
  );
}
