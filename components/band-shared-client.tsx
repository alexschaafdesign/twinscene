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

const heartButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E8E0D0]/25 text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0] disabled:opacity-50";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    // ti-heart (Tabler) — filled swaps to a solid fill, matching the ★ treatment
    // shows.tsx uses for "starred" state elsewhere in this app.
    <svg {...iconProps} width={17} height={17} fill={filled ? "currentColor" : "none"}>
      <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
    </svg>
  );
}

/**
 * Save/unsave toggle for a band, shown on the band profile page. Optimistic:
 * flips immediately on click and reverts if the request fails. A logged-out
 * visitor sees the same heart but it's a plain link to /login (with a return
 * path back to this band) instead of firing the toggle.
 */
export function SaveBandButton({
  slug,
  initialSaved,
  loggedIn,
}: {
  slug: string;
  initialSaved: boolean;
  loggedIn: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/bands/${slug}`)}`}
        aria-label="Log in to save this band"
        title="Log in to save this band"
        className={heartButtonClass}
      >
        <HeartIcon filled={false} />
      </Link>
    );
  }

  async function toggle() {
    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      const res = await fetch(`/api/bands/${slug}/save`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error(`save toggle failed (${res.status})`);
    } catch (err) {
      console.error("SaveBandButton: toggle failed", err);
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Unsave this band" : "Save this band"}
      title={saved ? "Unsave this band" : "Save this band"}
      className={heartButtonClass}
    >
      <HeartIcon filled={saved} />
    </button>
  );
}

const followButtonBaseClass =
  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";
const followButtonInactiveClass = `${followButtonBaseClass} border-[#E8E0D0]/25 text-[#E8E0D0]/80 hover:border-[#E8E0D0] hover:text-[#E8E0D0]`;
const followButtonActiveClass = `${followButtonBaseClass} border-[#8FD693]/50 bg-[#8FD693]/10 text-[#8FD693]`;

function BellIcon() {
  return (
    // ti-bell (Tabler) — deliberately different from the save heart, since
    // Follow ("keep up with this band") is a different action from Save
    // (bookmark/favorite).
    <svg {...iconProps} width={15} height={15}>
      <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </svg>
  );
}

/**
 * Follow/unfollow toggle for a band, shown on the band profile page next to
 * (but visually distinct from) SaveBandButton — a labeled pill rather than an
 * icon-only heart, since following is a different, forward-looking action
 * ("keep up with this band") from saving (a bookmark). Optimistic, same
 * pattern as SaveBandButton: flips immediately, reverts on failure. Logged-out
 * visitors get a plain link to /login instead of firing the toggle.
 */
export function FollowBandButton({
  slug,
  initialFollowing,
  loggedIn,
}: {
  slug: string;
  initialFollowing: boolean;
  loggedIn: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/bands/${slug}`)}`}
        aria-label="Log in to follow this band"
        title="Log in to follow this band"
        className={followButtonInactiveClass}
      >
        <BellIcon />
        Follow
      </Link>
    );
  }

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      const res = await fetch(`/api/bands/${slug}/follow`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error(`follow toggle failed (${res.status})`);
    } catch (err) {
      console.error("FollowBandButton: toggle failed", err);
      setFollowing(!next);
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
      aria-label={following ? "Unfollow this band" : "Follow this band"}
      title={following ? "Unfollow this band" : "Follow this band"}
      className={following ? followButtonActiveClass : followButtonInactiveClass}
    >
      <BellIcon />
      {following ? "Following" : "Follow"}
    </button>
  );
}
