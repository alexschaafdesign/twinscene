"use client";

// Site-wide account control — rendered from the root layout (a server
// component that resolves the current user via getCurrentUser()). Replaces
// the old AccountBar strip with a proper avatar + dropdown menu.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NotificationsBell from "@/components/NotificationsBell";

export interface AccountMenuUser {
  email: string;
  name: string | null;
  username: string | null;
  image_url: string | null;
}

export default function AccountMenu({
  user,
  notificationsUnread = 0,
  isAdmin = false,
}: {
  user: AccountMenuUser | null;
  notificationsUnread?: number;
  // Whether to surface the /admin shortcut in the header. Presentation only —
  // /admin and every route under it re-check is_admin server-side, so a stale
  // or forged `true` here just yields a bounce, not access.
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The site logo, now living in the persistent header (used to only appear,
  // much bigger, in the home page's own header) so it — and the way home it
  // links to — is visible from every page.
  const logo = (
    <Link href="/" className="flex shrink-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.webp"
        alt="Twin Scene"
        width={400}
        height={400}
        className="h-14 w-14 rounded-full sm:h-20 sm:w-20"
      />
      <span className="hidden font-mono text-base font-semibold uppercase tracking-widest text-[#E8E0D0] sm:inline">
        Twin Scene
      </span>
    </Link>
  );

  // The old home-page-only "welcome" header, condensed to a tagline that
  // fits between the logo and the account controls in every page's header.
  // Hidden below md — there's no room for a third column once the logo,
  // wordmark, and account controls are all fighting for a narrow row.
  const tagline = (
    <div className="hidden text-center md:block">
      <p className="text-xs font-semibold uppercase leading-relaxed tracking-[0.1em] text-[#E8E0D0]/70">
        No algorithms <span className="text-[#E8E0D0]/30">·</span> No ads{" "}
        <span className="text-[#E8E0D0]/30">·</span> No corporate overlords
      </p>
      <p className="mt-1 text-[13px] text-[#E8E0D0]/50">
        Created and maintained by Alex at{" "}
        <a
          href="https://thebirdhaus.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#E8E0D0]/80"
        >
          the Birdhaus
        </a>
      </p>
    </div>
  );

  // Click-outside and Escape-to-close, only wired up while the menu is open.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function logOut() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3 sm:px-8">
        {logo}
        {tagline}
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="justify-self-end rounded-md border border-[#E8E0D0]/25 px-3.5 py-1.5 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const initial = (user.name?.trim()?.[0] || user.email[0] || "?").toUpperCase();

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3 sm:px-8">
      {logo}
      {tagline}
      <div className="flex items-center justify-self-end gap-2">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex h-10 items-center rounded-full border-2 border-[#E8E0D0]/35 bg-[#E8E0D0]/10 px-4 text-xs font-medium text-[#E8E0D0]/80 shadow-sm shadow-black/20 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0]"
          >
            Admin
          </Link>
        )}
        <NotificationsBell initialUnread={notificationsUnread} />
        <div className="relative" ref={containerRef}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Account menu"
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#E8E0D0]/35 bg-[#E8E0D0]/10 text-sm font-semibold text-[#E8E0D0] shadow-sm shadow-black/20 transition hover:border-[#E8E0D0]/60 focus:border-[#E8E0D0]/70 focus:outline-none"
          >
            {user.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">{initial}</span>
            )}
          </button>

          {open && (
            <div
              role="menu"
              aria-label="Account"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-[#E8E0D0]/15 bg-[#090909] py-1 text-sm shadow-lg shadow-black/40"
            >
              <div className="truncate border-b border-[#E8E0D0]/10 px-4 py-2 text-xs text-[#E8E0D0]/50">
                {user.username ? `@${user.username}` : user.name || user.email}
              </div>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
              >
                Your profile
              </Link>
              <Link
                href="/profile/edit"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
              >
                Edit profile
              </Link>
              {user.username && (
                <Link
                  href={`/u/${user.username}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
                >
                  View public profile
                </Link>
              )}
              <Link
                href="/profile#saved-bands"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
              >
                Saved bands
              </Link>
              <Link
                href="/profile#follows"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
              >
                Bands you follow
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={logOut}
                className="block w-full px-4 py-2 text-left text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
