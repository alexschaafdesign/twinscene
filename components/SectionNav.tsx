"use client";

// The site's top-level section tabs (Feed, then the scene directories: Bands,
// Shows, Venues, Musicians, then the softer-grouped Reads + Comrades +
// Projects). Two former directories were folded away to keep the bar focused:
// Photo/Video is now a category inside Comrades (/photo-video redirects there),
// and Playlists folds into Reads (reached via a header link; /playlists stays a
// route but not a tab). Sections whose destinations fan out (Comrades'
// categories, Projects' programs) carry a `menu` and render as a dropdown (see
// NavDropdown) rather than another row of tabs. Projects currently holds just
// Song Club (our own admin-run songwriter meetups).
// Rendered once from the root layout, outside {children}, so it's
// part of the persistent shell and never unmounts on navigation — unlike the
// old copy that lived inline on the home page and vanished on every other route.
//
// Below sm there's no room for all the tabs on one line, so instead of wrapping
// (old behavior) or hiding them behind a dropdown (which read as unclear that
// it even *was* the nav), the row scrolls horizontally — same tabs as desktop,
// always visible as tabs, just swipeable. The edge mask fades the last partial
// tab to hint there's more to scroll to.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COMRADE_CATEGORIES, categorySlug, comradeCategoryLabel } from "@/lib/comradeUtils";

const tabClass =
  "inline-block border-b-2 px-1 pb-3 text-sm font-semibold uppercase tracking-wide transition";
const activeClass = "border-[#E8E0D0] text-[#E8E0D0]";
const inactiveClass =
  "border-transparent text-[#E8E0D0]/70 hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]";

// `grouped` tabs (Reads, Comrades, Projects) are a softer aside from the
// scene-directory tabs — on sm+ they cluster at the right edge of the bar
// (ml-auto) to read as their own group; on mobile they just trail the rest in
// the horizontal scroll.
type MenuItem = { href: string; label: string };
type Section = {
  href: string;
  label: string;
  isActive: (path: string) => boolean;
  grouped?: boolean;
  // When present, the tab is a dropdown of these destinations (see NavDropdown)
  // instead of a plain link.
  menu?: MenuItem[];
};

// Comrades is one directory (a single `comrades` table with a `category`
// column), but it fans out into a dropdown so each category has its own
// shareable landing page. "All Comrades" heads the list (the unfiltered
// /comrades grid); the rest map to /comrades/c/<category-slug>.
const COMRADE_MENU: MenuItem[] = [
  { href: "/comrades", label: "All Comrades" },
  ...COMRADE_CATEGORIES.map((c) => ({
    href: `/comrades/c/${categorySlug(c)}`,
    label: comradeCategoryLabel(c),
  })),
];

// Projects — our own admin-run programming, not a scraped/scene directory. Just
// Song Club today; the dropdown leaves room to add more programs later.
const PROJECTS_MENU: MenuItem[] = [{ href: "/song-club", label: "Song Club" }];

// A section tab that opens a menu of destinations rather than being a plain
// link (Comrades' categories, Projects' programs). The menu is
// `position: fixed`, positioned from the trigger's rect, so it escapes the nav
// row's horizontal-scroll clip on mobile (an `overflow-x-auto` container clips
// `overflow-y` too). It closes on outside click, Escape, route change, and any
// scroll/resize (a fixed menu doesn't track the trigger once the page moves).
function NavDropdown({ section }: { section: Section }) {
  const pathname = usePathname();
  const isCurrent = section.isActive(pathname);
  const items = section.menu ?? [];
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Any navigation closes the menu (clicking an item, or landing elsewhere).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ left: r.left, top: r.bottom + 8 });
    }
    place();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }

    window.addEventListener("resize", place);
    // Capture so the nav row's own horizontal scroll (which doesn't bubble)
    // also dismisses the menu.
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={isCurrent ? "page" : undefined}
        className={`${tabClass} inline-flex items-center gap-1 ${isCurrent ? activeClass : inactiveClass}`}
      >
        {section.label}
        {/* ti-chevron-down (Tabler) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </button>

      {open && coords && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", left: coords.left, top: coords.top }}
          className="z-50 min-w-[13rem] overflow-hidden rounded-lg border border-[#E8E0D0]/15 bg-[#141210] py-1 shadow-xl shadow-black/50"
        >
          {items.map((item) => {
            // Exact match: the top-level tab already carries "you're in this
            // section" via isCurrent, so a menu item highlights only on its own
            // landing page (e.g. "All Comrades" isn't lit on a category page).
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-4 py-2 text-sm transition ${
                  active
                    ? "bg-[#E8E0D0]/10 text-[#E8E0D0]"
                    : "text-[#E8E0D0]/75 hover:bg-[#E8E0D0]/[0.06] hover:text-[#E8E0D0]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

const SECTIONS: Section[] = [
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
  { href: "/musicians", label: "Musicians", isActive: (p) => p.startsWith("/musicians") },
  {
    href: "/reads",
    label: "Reads",
    // The Reads hub (/reads), the writer directory/detail pages (/writers,
    // /writers/[slug]), and Playlists (/playlists) are one section — Reads is
    // the editorial hub, and both are reached via links in its header.
    isActive: (p) =>
      p.startsWith("/reads") || p.startsWith("/writers") || p.startsWith("/playlists"),
    grouped: true,
  },
  {
    href: "/comrades",
    label: "Comrades",
    isActive: (p) => p.startsWith("/comrades"),
    grouped: true,
    menu: COMRADE_MENU,
  },
  {
    href: "/song-club",
    label: "Projects",
    // Projects is a dropdown of our own programs; Song Club (list + event
    // pages) is the only one for now.
    isActive: (p) => p.startsWith("/song-club"),
    grouped: true,
    menu: PROJECTS_MENU,
  },
];

export default function SectionNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  const mainSections = SECTIONS.filter((s) => !s.grouped);
  const groupedSections = SECTIONS.filter((s) => s.grouped);
  const groupIsCurrent = groupedSections.some((s) => s.isActive(pathname));

  // Always a link — even the current section stays clickable so it navigates
  // back to that section's main list (e.g. Venues from a specific venue page).
  // It just carries the active styling + aria-current when you're already in
  // the section.
  function tabLink(section: Section) {
    const isCurrent = section.isActive(pathname);
    return (
      <Link
        href={section.href}
        aria-current={isCurrent ? "page" : undefined}
        className={`${tabClass} ${isCurrent ? activeClass : inactiveClass}`}
      >
        {section.label}
      </Link>
    );
  }

  return (
    <nav className="border-b border-[#E8E0D0]/20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <ul className="flex items-end gap-x-6 gap-y-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:overflow-visible sm:[mask-image:none]">
          {mainSections.map((section, i) => (
            <li
              key={section.href}
              ref={section.isActive(pathname) ? activeRef : undefined}
              className="flex shrink-0 items-end gap-x-6"
            >
              {/* Feed leads the group but reads as a personal, separate
                  destination from the scene-wide directory tabs — a thin
                  divider (rather than another gap) keeps that distinction
                  without pushing it out to the opposite side of the bar. */}
              {i === 1 && (
                <span aria-hidden="true" className="mb-3 h-4 w-px shrink-0 bg-[#E8E0D0]/20" />
              )}
              {section.menu ? <NavDropdown section={section} /> : tabLink(section)}
            </li>
          ))}

          {/* Reads + Comrades + Projects: the softer, non-directory sections.
              On sm+ `ml-auto` pushes the cluster to the right edge, setting it
              apart from the scene-directory tabs. On mobile there's no room to
              split the row, so they just trail the others in the horizontal
              scroll. */}
          {groupedSections.length > 0 && (
            <li
              ref={groupIsCurrent ? activeRef : undefined}
              className="flex shrink-0 items-end gap-x-6 sm:ml-auto"
            >
              {groupedSections.map((section) => (
                <span key={section.href} className="shrink-0">
                  {section.menu ? <NavDropdown section={section} /> : tabLink(section)}
                </span>
              ))}
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
