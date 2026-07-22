import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInboxForUser } from "@/lib/messaging";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Messages — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Relative-ish timestamp for the list — coarse is fine here.
function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  // Server renders in UTC; pin Central so the date doesn't slip near midnight.
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
}

function initiatorLabel(row: {
  initiator_name: string | null;
  initiator_username: string | null;
}): string {
  if (row.initiator_name) return row.initiator_name;
  if (row.initiator_username) return `@${row.initiator_username}`;
  return "Someone";
}

// One unified inbox: every conversation addressed to any identity the user
// holds (bands they edit, their linked musician) plus every thread they
// started. Each row is badged with which identity it was sent to.
export default async function MessagesInboxPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile/messages");
  }

  const inbox = await getInboxForUser(user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <BackLink href="/profile" label="Profile" />
      <h1 className="text-2xl font-medium">Messages</h1>

      {inbox.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">
          No messages yet. Message a band or musician from their page to start a
          conversation.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#E8E0D0]/10 overflow-hidden rounded-md border border-[#E8E0D0]/15">
          {inbox.map((row) => (
            <li key={row.id}>
              <Link
                href={`/profile/messages/${row.id}`}
                className="flex items-start gap-3 px-4 py-3 transition hover:bg-[#E8E0D0]/5"
              >
                {/* Unread dot */}
                <span
                  aria-hidden="true"
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    row.unread ? "bg-[#8FD693]" : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/70">
                      {row.tag}
                    </span>
                    <span className="shrink-0 text-xs text-[#E8E0D0]/40">
                      {when(row.last_message_at)}
                    </span>
                  </div>
                  <p className={`mt-1 truncate text-sm ${row.unread ? "font-medium text-[#E8E0D0]" : "text-[#E8E0D0]/70"}`}>
                    {initiatorLabel(row)}
                  </p>
                  {row.last_body && (
                    <p className="mt-0.5 truncate text-sm text-[#E8E0D0]/45">{row.last_body}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
