"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShowStatus } from "@/lib/showSaves";

const baseBtn = "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";
const inactiveBtn = `${baseBtn} border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]`;
const activeBtn = `${baseBtn} border-[#8FD693]/50 bg-[#8FD693]/10 text-[#8FD693]`;
const shareBtn = `${baseBtn} border-[#8FD693]/50 bg-[#8FD693]/10 text-[#8FD693] hover:bg-[#8FD693]/20`;

// The "Interested" toggle is a bare star icon (outline when off, filled green
// when on) rather than a text pill — see StarButton below.
const starBtn = "inline-flex items-center justify-center rounded-md p-1 transition disabled:opacity-50";
const starInactive = `${starBtn} text-[#E8E0D0]/45 hover:bg-[#E8E0D0]/5 hover:text-[#E8E0D0]`;
const starActive = `${starBtn} text-[#8FD693] hover:bg-[#8FD693]/10`;

/** Star glyph — outline when not interested, filled when interested. Tabler
 * ti-star path; fill toggles between none and currentColor. `size` scales it up
 * for prominent placements (e.g. the show detail header). */
function StarIcon({ filled, size = 22 }: { filled: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
    </svg>
  );
}

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
  starSize = 22,
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
  /** Pixel size of the "Interested" star icon. Larger for prominent placements
   * like the show detail header; defaults to the compact list-row size. */
  starSize?: number;
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
      const canShare = Boolean(navigator.canShare?.({ files: [probe] }));
      // Desktop Chrome also reports canShare(files)=true, so additionally
      // require a mobile signal: the UA-CH `mobile` flag when present, else a
      // coarse pointer (touch as the primary input). Keeps the button phone-only.
      const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
      const isMobile = uaData?.mobile ?? window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setCanShareFiles(canShare && isMobile);
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
    // Past shows keep the text toggle; upcoming shows use the star icon.
    if (isPast) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          aria-label="Log in to track this show"
          title="Log in to track this show"
          className={inactiveBtn}
        >
          I went to this
        </Link>
      );
    }
    return (
      <Link
        href={`/login?next=${encodeURIComponent(returnTo)}`}
        aria-label="Interested — log in to track this show"
        title="Interested — log in to track this show"
        className={starInactive}
      >
        <StarIcon filled={false} size={starSize} />
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
        aria-label="Interested"
        title={status === "interested" ? "Interested — tap to remove" : "Mark interested"}
        className={status === "interested" ? starActive : starInactive}
      >
        <StarIcon filled={status === "interested"} size={starSize} />
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
