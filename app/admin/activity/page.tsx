import type { Metadata } from "next";
import Link from "next/link";
import AdminLogin from "@/components/AdminLogin";
import { isAdminAuthed } from "../auth";
import {
  fetchShowHistory,
  SHOW_HISTORY_WINDOW_DAYS,
} from "@/lib/fetchShowHistory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recent Activity — Crawlspace Admin",
  robots: { index: false, follow: false },
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  linked_band: "Linked band",
  starred: "Starred",
};

/** Format an ISO timestamp for display. */
function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2026-07-25" → "Jul 25". Falls back to the raw string. */
function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  if (!secret || !(await isAdminAuthed(provided))) {
    return <AdminLogin error={sp.error === "1"} />;
  }

  const entries = await fetchShowHistory();
  const q = `secret=${encodeURIComponent(secret)}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <Link
          href={`/admin?${q}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
        >
          <span aria-hidden>←</span> Admin
        </Link>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Recent Activity
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Every write to the shows table over the last {SHOW_HISTORY_WINDOW_DAYS}{" "}
          days, most recent first.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
          No show activity in the last {SHOW_HISTORY_WINDOW_DAYS} days.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="min-w-0 text-sm">
                  <span className="text-[#E8E0D0]/60">
                    {shortDate(entry.show.date)} · {entry.show.venue} ·{" "}
                  </span>
                  <span className="text-[#E8E0D0]">{entry.show.title}</span>
                </p>
                <span className="shrink-0 text-xs text-[#E8E0D0]/45">
                  {formatTs(entry.createdAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 font-medium uppercase tracking-wide text-[#E8E0D0]/70">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span className="text-[#E8E0D0]/50">{entry.actor}</span>
                {entry.submitterName && (
                  <span className="text-[#E8E0D0]/50">
                    — submitted by {entry.submitterName}
                    {entry.submitterEmail && ` <${entry.submitterEmail}>`}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
