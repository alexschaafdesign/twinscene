"use client";

// Site-wide account status strip — rendered from the root layout (a server
// component that resolves the current user via getCurrentUser()). There was
// no shared header/nav anywhere in the app before this; every other authed
// surface (admin pages, band claim/edit links) is reached by direct URL. This
// is the first place a logged-in user can get to /profile without typing it.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AccountBar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-4 px-5 py-2 text-xs text-[#E8E0D0]/60 sm:px-8">
      {email ? (
        <>
          <span className="hidden truncate sm:inline">{email}</span>
          <Link href="/profile" className="transition hover:text-[#E8E0D0]">
            Saved bands
          </Link>
          <button type="button" onClick={logOut} className="transition hover:text-[#E8E0D0]">
            Log out
          </button>
        </>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="transition hover:text-[#E8E0D0]"
        >
          Log in
        </Link>
      )}
    </div>
  );
}
