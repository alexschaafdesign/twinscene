import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications, markAllRead } from "@/lib/notifications";
import { describeNotification, relativeTime } from "@/components/notificationText";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Notifications — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The full notifications inbox — the bell dropdown's "See all" destination.
// Visiting marks everything read (the list is captured first so the just-read
// rows still render with their unread dot this once).
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/notifications");
  }

  const items = await listNotifications(user.id, 100);
  await markAllRead(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <BackLink href="/profile" label="Profile" className="mb-8" />
      <h1 className="text-2xl font-medium text-[#E8E0D0]">Notifications</h1>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-[#E8E0D0]/50">
          Nothing yet. Follow bands and save shows to hear about updates here.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-[#E8E0D0]/[0.08] border-y border-[#E8E0D0]/[0.08]">
          {items.map((n) => {
            const { text, href } = describeNotification(n);
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={`flex items-start gap-2.5 py-3.5 transition hover:bg-[#E8E0D0]/[0.03] ${
                    n.read_at ? "text-[#E8E0D0]/60" : "text-[#E8E0D0]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      n.read_at ? "bg-transparent" : "bg-[#E86B5A]"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm">{text}</span>
                    <span className="mt-0.5 block text-xs text-[#E8E0D0]/40">
                      {relativeTime(n.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
