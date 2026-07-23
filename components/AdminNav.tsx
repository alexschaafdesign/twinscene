"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sections of the unified admin dashboard. Everything an admin can reach lives
// here — the scraper tools (which drive the SCRAPE_SECRET machine APIs behind
// the scenes) alongside the user/claims management that gates on is_admin. The
// nav itself only renders for admins (app/admin/layout.tsx), so it's safe to
// list every destination unconditionally.
const LINKS: { href: string; label: string }[] = [
  { href: "/admin", label: "Scrapers" },
  { href: "/admin/graphics", label: "Graphics" },
  { href: "/shows/import", label: "Import" },
  { href: "/admin/shows", label: "Shows" },
  { href: "/admin/bands", label: "Bands" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/articles", label: "Reads" },
  { href: "/admin/writers", label: "Writers" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/reconcile", label: "Reconcile" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/claims", label: "Band claims" },
  { href: "/admin/band-member-claims", label: "Member claims" },
  { href: "/admin/media-pro-claims", label: "Photo/video claims" },
  { href: "/admin/writer-claims", label: "Writer claims" },
  { href: "/admin/comrade-claims", label: "Comrade claims" },
  { href: "/admin/venue-claims", label: "Venue claims" },
];

/** Whether `href` is the active section. "/admin" matches only exactly (every
 *  other route also starts with it); the rest match on prefix so nested pages
 *  like /admin/bands/x/editors keep a parent highlighted where sensible. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.03)]">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-5 py-2 sm:px-8">
        <Link
          href="/"
          className="mr-1 shrink-0 text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          <span aria-hidden>←</span>
        </Link>
        <Link
          href="/admin"
          className="mr-2 shrink-0 text-sm font-semibold tracking-tight text-[#E8E0D0]"
        >
          Admin
        </Link>
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded px-2.5 py-1 text-sm transition ${
                active
                  ? "bg-[#E8E0D0]/15 font-medium text-[#E8E0D0]"
                  : "text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/8 hover:text-[#E8E0D0]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
