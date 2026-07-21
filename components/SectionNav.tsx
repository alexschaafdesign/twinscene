"use client";

// The site's top-level section tabs (Feed, then Bands, Shows, Venues,
// Playlists, Musicians). Rendered once from the root layout, outside
// {children}, so it's part of the persistent shell and never unmounts on
// navigation — unlike the old copy that lived inline on the home page and
// vanished on every other route.
//
// Below sm there's no room for all six tabs on one line, so instead of
// wrapping (old behavior) or hiding them behind a dropdown (which read as
// unclear that it even *was* the nav), the row scrolls horizontally — same
// tabs as desktop, always visible as tabs, just swipeable. The edge mask
// fades the last partial tab to hint there's more to scroll to.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const tabClass =
  "inline-block border-b-2 px-1 pb-3 text-sm font-semibold uppercase tracking-wide transition";
const activeClass = "border-[#E8E0D0] text-[#E8E0D0]";
const inactiveClass =
  "border-transparent text-[#E8E0D0]/70 hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]";

const SECTIONS: { href: string; label: string; isActive: (path: string) => boolean }[] = [
  { href: "/feed", label: "Feed", isActive: (p) => p.startsWith("/feed") },
  {
    href: "/",
    label: "Bands",
    // The band directory lives at "/"; band and musician detail pages
    // (/bands/[slug], /m/[slug]) are part of the same section.
    isActive: (p) => p === "/" || p.startsWith("/bands") || p.startsWith("/m/"),
  },
  { href: "/shows", label: "Shows", isActive: (p) => p.startsWith("/shows") },
  { href: "/venues", label: "Venues", isActive: (p) => p.startsWith("/venues") },
  { href: "/photo-video", label: "Photo/Video", isActive: (p) => p.startsWith("/photo-video") },
  { href: "/playlists", label: "Playlists", isActive: (p) => p.startsWith("/playlists") },
  { href: "/musicians", label: "Musicians", isActive: (p) => p.startsWith("/musicians") },
];

export default function SectionNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav className="border-b border-[#E8E0D0]/20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <ul
          className="flex items-end gap-x-6 gap-y-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:overflow-visible sm:[mask-image:none]"
        >
          {SECTIONS.map(({ href, label, isActive }, i) => {
            const isCurrent = isActive(pathname);
            return (
              <li
                key={href}
                ref={isCurrent ? activeRef : undefined}
                className="flex shrink-0 items-end gap-x-6"
              >
                {/* Feed leads the group but reads as a personal, separate
                    destination from the scene-wide directory tabs — a thin
                    divider (rather than another gap) keeps that distinction
                    without pushing it out to the opposite side of the bar. */}
                {i === 1 && (
                  <span aria-hidden="true" className="mb-3 h-4 w-px shrink-0 bg-[#E8E0D0]/20" />
                )}
                {/* Always a link — even the current section stays clickable so
                    it navigates back to that section's main list (e.g. Venues
                    from a specific venue page). It just carries the active
                    styling + aria-current when you're already in the section. */}
                <Link
                  href={href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`${tabClass} ${isCurrent ? activeClass : inactiveClass}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
