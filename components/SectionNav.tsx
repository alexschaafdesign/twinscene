"use client";

// The site's top-level section tabs (Feed, then Bands, Shows, Venues,
// Playlists, Musicians). Rendered once from the root layout, outside
// {children}, so it's part of the persistent shell and never unmounts on
// navigation — unlike the old copy that lived inline on the home page and
// vanished on every other route.

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabClass =
  "inline-block border-b-2 px-1 pb-3 text-sm font-semibold uppercase tracking-wide transition";
const activeClass = "border-[#E8E0D0] text-[#E8E0D0]";
const inactiveClass =
  "border-transparent text-[#E8E0D0]/70 hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]";

const SECTIONS: { href: string; label: string; isActive: (path: string) => boolean }[] = [
  {
    href: "/",
    label: "Bands",
    // The band directory lives at "/"; band and musician detail pages
    // (/bands/[slug], /m/[slug]) are part of the same section.
    isActive: (p) => p === "/" || p.startsWith("/bands") || p.startsWith("/m/"),
  },
  { href: "/shows", label: "Shows", isActive: (p) => p.startsWith("/shows") },
  { href: "/venues", label: "Venues", isActive: (p) => p.startsWith("/venues") },
  { href: "/playlists", label: "Playlists", isActive: (p) => p.startsWith("/playlists") },
  { href: "/musicians", label: "Musicians", isActive: (p) => p.startsWith("/musicians") },
];

export default function SectionNav() {
  const pathname = usePathname();

  const feedActive = pathname.startsWith("/feed");

  return (
    <nav className="border-b border-[#E8E0D0]/20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <ul className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {/* Feed leads the group but reads as a personal, separate
              destination from the scene-wide directory tabs — a thin
              divider (rather than another gap) keeps that distinction
              without pushing it out to the opposite side of the bar. */}
          <li>
            {feedActive ? (
              <span aria-current="page" className={`${tabClass} ${activeClass}`}>
                Feed
              </span>
            ) : (
              <Link href="/feed" className={`${tabClass} ${inactiveClass}`}>
                Feed
              </Link>
            )}
          </li>
          <li aria-hidden="true" className="mb-3 h-4 w-px shrink-0 bg-[#E8E0D0]/20" />
          {SECTIONS.map(({ href, label, isActive }) => {
            const active = isActive(pathname);
            return (
              <li key={href}>
                {active ? (
                  <span aria-current="page" className={`${tabClass} ${activeClass}`}>
                    {label}
                  </span>
                ) : (
                  <Link href={href} className={`${tabClass} ${inactiveClass}`}>
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
