"use client";

// Stateful shared band components. Split out from band-shared.tsx because
// "use client" turns every export into a client reference — and the pure
// helpers there need to be callable directly from server components. These
// use React state, so they belong on the client. Server components can still
// *render* them.

import { useState } from "react";
import Link from "next/link";
import type { Band } from "@/lib/fetchBands";
import { iconProps, initials } from "@/components/band-shared";

/** Square band image with an initials fallback when missing or broken.
 *
 * `thumb` opts into the small pre-generated 400px variant (bands/thumb/<slug>.jpg)
 * — use it for grid/list cards, where the full-res photo is a 5–25x over-fetch.
 * Leave it off for the profile hero, which is rendered large enough to want the
 * original. The source degrades in order: thumbnail → full photo → initials, so
 * a band not yet backfilled (no thumbnailUrl) or a 404'd thumbnail still shows
 * its photo rather than dropping straight to initials. */
export function BandImage({
  band,
  className = "",
  thumb = false,
}: {
  band: Band;
  className?: string;
  thumb?: boolean;
}) {
  const [failCount, setFailCount] = useState(0);

  // Priority list of sources to try; onError advances to the next one.
  const candidates = [
    thumb && band.thumbnailUrl ? band.thumbnailUrl : null,
    band.image || null,
  ].filter((s): s is string => !!s);
  const src = candidates[failCount] ?? null;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- band art comes from arbitrary external hosts
        <img
          src={src}
          alt={band.name}
          loading="lazy"
          onError={() => setFailCount((c) => c + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(band.name)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Copies `text` to the clipboard, briefly showing a "Copied" confirmation. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be unavailable (e.g. insecure context) — ignore.
        }
      }}
      className="inline-flex items-center gap-1 text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
    >
      {/* ti-copy (Tabler) */}
      <svg {...iconProps} width={15} height={15}>
        <path d="M8 10a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
        <path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
      {copied && <span className="text-xs text-[#8FD693]">Copied</span>}
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    // ti-heart (Tabler) — filled swaps to a solid fill, matching the ★ treatment
    // shows.tsx uses for "starred" state elsewhere in this app.
    <svg {...iconProps} width={17} height={17} fill={filled ? "currentColor" : "none"}>
      <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
    </svg>
  );
}


// The icon variant sits over band photos in the directory grid, so it carries
// its own translucent backdrop — a bare outline disappears against a busy
// image.
const heartIconOnlyClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-[#2A2420]/70 backdrop-blur-sm transition disabled:opacity-50";

const heartPillBaseClass =
  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";

/** Idle vs. following, for both variants. Following reads as filled + accent;
 * idle is the same neutral outline every other control on the page uses. */
function heartClass(variant: "pill" | "icon", following: boolean): string {
  const base = variant === "pill" ? heartPillBaseClass : heartIconOnlyClass;
  return following
    ? `${base} border-[#F5A3A3]/50 bg-[#F5A3A3]/10 text-[#F5A3A3]`
    : `${base} border-[#E8E0D0]/25 text-[#E8E0D0]/80 hover:border-[#E8E0D0] hover:text-[#E8E0D0]`;
}

/**
 * Follow/unfollow toggle for a band — the heart. One control covering what
 * used to be two (save + follow); see migration 0028. Following a band lists
 * it on your profile and subscribes you to its notifications.
 *
 * `variant` is presentation only: "pill" (heart + label) on the band profile
 * page, "icon" (heart alone) for the directory grid, where a label per card
 * would be noise.
 *
 * Optimistic — flips immediately on click, reverts if the request fails.
 * Logged-out visitors get a plain link to /login with a return path instead of
 * firing the toggle. `onToggle` lets a parent (e.g. the grid) mirror the new
 * state without a refetch.
 */
export function FollowBandButton({
  slug,
  initialFollowing,
  loggedIn,
  variant = "pill",
  nextPath,
  onToggle,
}: {
  slug: string;
  initialFollowing: boolean;
  loggedIn: boolean;
  variant?: "pill" | "icon";
  /** Where /login should return to. Defaults to the band's own page. */
  nextPath?: string;
  onToggle?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  const label = following ? "Unfollow this band" : "Follow this band";

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(nextPath ?? `/bands/${slug}`)}`}
        aria-label="Log in to follow this band"
        title="Log in to follow this band"
        className={heartClass(variant, false)}
        // The grid wraps each card in its own <Link>; without this a heart
        // click would also navigate to the band page underneath it.
        onClick={(e) => e.stopPropagation()}
      >
        <HeartIcon filled={false} />
        {variant === "pill" && "Follow"}
      </Link>
    );
  }

  async function toggle(e: React.MouseEvent) {
    // Same reason as above — in the grid this button sits inside a card that
    // navigates on click.
    e.preventDefault();
    e.stopPropagation();

    const next = !following;
    setFollowing(next);
    onToggle?.(next);
    setPending(true);
    try {
      const res = await fetch(`/api/bands/${slug}/follow`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error(`follow toggle failed (${res.status})`);
    } catch (err) {
      console.error("FollowBandButton: toggle failed", err);
      setFollowing(!next);
      onToggle?.(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      aria-label={label}
      title={label}
      className={heartClass(variant, following)}
    >
      <HeartIcon filled={following} />
      {variant === "pill" && (following ? "Following" : "Follow")}
    </button>
  );
}
