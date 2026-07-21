"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShowStatus } from "@/lib/showSaves";

const baseBtn = "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";
const inactiveBtn = `${baseBtn} border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]`;
const activeBtn = `${baseBtn} border-[#8FD693]/50 bg-[#8FD693]/10 text-[#8FD693]`;
const shareBtn = `${baseBtn} border-[#8FD693]/50 bg-[#8FD693]/10 text-[#8FD693] hover:bg-[#8FD693]/20`;

/**
 * Attendance controls for one show — "Interested"/"Going" toggles for an
 * upcoming show, or a single "I went to this" toggle for a past one. Clicking
 * the already-active option clears it. Optimistic, same pattern as
 * SaveBandButton/FollowBandButton: flips immediately, reverts on failure.
 * Logged-out clicks go to /login (returning to `returnTo`) instead of firing
 * the toggle.
 */
export function ShowStatusButtons({
  showId,
  isPast,
  initialStatus,
  loggedIn,
  returnTo,
  onStatusChange,
  showGoing = false,
}: {
  showId: string;
  isPast: boolean;
  initialStatus: ShowStatus | null;
  loggedIn: boolean;
  returnTo: string;
  /** Called after a toggle succeeds — e.g. so a profile list can drop the row
   * once its status is cleared. */
  onStatusChange?: (status: ShowStatus | null) => void;
  /** Show the "Going" toggle. Off by default — we no longer offer separate
   * interested/going tracking, just "Interested" (and "I went to this" for
   * past shows). Existing "going" rows in the DB are untouched; this only
   * hides the control. */
  showGoing?: boolean;
}) {
  const [status, setStatus] = useState<ShowStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Whether this device can share an image file via the native share sheet —
  // true on mobile Safari/Chrome, false on desktop. Probed after mount so SSR
  // and first client render agree (both start false). Gates the "Share to
  // Stories" button so it only appears where the hand-off to Instagram works.
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  async function shareToStories() {
    setSharing(true);
    try {
      // The card image carries the "Interested" chip via ?status=.
      const res = await fetch(`/api/og/show/${showId}?status=interested`);
      if (!res.ok) throw new Error(`card render failed (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], "twin-scene-show.png", { type: blob.type || "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Fallback: hand them the image to post manually.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "twin-scene-show.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet; not worth surfacing.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("ShowStatusButtons: share failed", err);
      }
    } finally {
      setSharing(false);
    }
  }

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(returnTo)}`}
        aria-label="Log in to track this show"
        title="Log in to track this show"
        className={inactiveBtn}
      >
        {isPast ? "I went to this" : "Interested"}
      </Link>
    );
  }

  async function apply(next: ShowStatus | null) {
    const prev = status;
    setStatus(next);
    setPending(true);
    try {
      const res = next
        ? await fetch(`/api/shows/${showId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          })
        : await fetch(`/api/shows/${showId}/status`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status update failed (${res.status})`);
      onStatusChange?.(next);
    } catch (err) {
      console.error("ShowStatusButtons: update failed", err);
      setStatus(prev);
    } finally {
      setPending(false);
    }
  }

  function toggle(target: ShowStatus) {
    apply(status === target ? null : target);
  }

  if (isPast) {
    return (
      <button
        type="button"
        onClick={() => toggle("went")}
        disabled={pending}
        aria-pressed={status === "went"}
        className={status === "went" ? activeBtn : inactiveBtn}
      >
        {status === "went" ? "✓ You went" : "I went to this"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => toggle("interested")}
        disabled={pending}
        aria-pressed={status === "interested"}
        className={status === "interested" ? activeBtn : inactiveBtn}
      >
        Interested
      </button>
      {showGoing && (
        <button
          type="button"
          onClick={() => toggle("going")}
          disabled={pending}
          aria-pressed={status === "going"}
          className={status === "going" ? activeBtn : inactiveBtn}
        >
          Going
        </button>
      )}
      {status === "interested" && canShareFiles && (
        <button
          type="button"
          onClick={shareToStories}
          disabled={sharing}
          className={shareBtn}
        >
          {sharing ? "Preparing…" : "Share to Stories"}
        </button>
      )}
    </div>
  );
}
