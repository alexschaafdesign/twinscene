"use client";

// Header notification bell: an unread badge + a dropdown of recent
// notifications. The unread count is seeded from the server (layout render) so
// the badge is correct on first paint; opening the dropdown lazily fetches the
// list from /api/notifications and marks everything read. Mirrors AccountMenu's
// click-outside/Escape dropdown behavior so the two sit together in the header.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  describeNotification,
  relativeTime,
  type NotificationView,
} from "@/components/notificationText";

interface NotificationRow extends NotificationView {
  id: number;
  read_at: string | null;
  created_at: string;
}

export default function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click-outside + Escape to close, only while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    // Fetch the list on each open (cheap, keeps it fresh), and mark read.
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if ((data.unreadCount ?? 0) > 0) {
        // Optimistically clear the badge, then persist. A failed mark leaves the
        // rows unread server-side; the next open re-marks them.
        setUnread(0);
        fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#E8E0D0]/35 bg-[#E8E0D0]/10 text-[#E8E0D0] shadow-sm shadow-black/20 transition hover:border-[#E8E0D0]/60 focus:border-[#E8E0D0]/70 focus:outline-none"
      >
        {/* Bell glyph */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E86B5A] px-1 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-[#E8E0D0]/15 bg-[#090909] text-sm shadow-lg shadow-black/40"
        >
          <div className="flex items-center justify-between border-b border-[#E8E0D0]/10 px-4 py-2 text-xs text-[#E8E0D0]/50">
            <span>Notifications</span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
            >
              See all
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (!items || items.length === 0) ? (
              <p className="px-4 py-6 text-center text-xs text-[#E8E0D0]/40">Loading…</p>
            ) : !items || items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#E8E0D0]/40">
                No notifications yet.
              </p>
            ) : (
              <ul>
                {items.map((n) => {
                  const { text, href } = describeNotification(n);
                  return (
                    <li key={n.id}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className={`block border-b border-[#E8E0D0]/[0.06] px-4 py-3 transition hover:bg-[#E8E0D0]/10 ${
                          n.read_at ? "text-[#E8E0D0]/60" : "text-[#E8E0D0]"
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          {!n.read_at && (
                            <span
                              aria-hidden
                              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E86B5A]"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block">{text}</span>
                            <span className="mt-0.5 block text-xs text-[#E8E0D0]/40">
                              {relativeTime(n.created_at)}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
