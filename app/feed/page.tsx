import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getFeed } from "@/lib/feed";
import StatusEditor from "@/components/StatusEditor";
import FeedList from "@/components/FeedList";

export const metadata: Metadata = {
  title: "Feed — Twin Scene",
  description: "What people in the Twin Cities music scene are up to right now.",
};

// getFeed() reads the DB directly, so force dynamic rendering the same way the
// other directory pages do — otherwise this would prerender once and go stale.
export const dynamic = "force-dynamic";

// The scene feed — statuses and band follows. lib/feed.ts is a union of item
// kinds; adding another means a new case in components/FeedList.tsx and
// nothing else here.
export default async function FeedPage() {
  const [items, currentUser] = await Promise.all([getFeed(), getCurrentUser()]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-6 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Feed</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Statuses and new follows from around the scene.
        </p>
      </header>

      <div className="mb-8">
        {currentUser ? (
          <StatusEditor
            name={currentUser.name?.trim() || currentUser.username || "You"}
            initialStatus={currentUser.status}
            initialStatusAt={currentUser.status_at}
            size="large"
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-5 py-4">
            <p className="text-base text-[#E8E0D0]/50">Log in to set your status</p>
            <Link
              href="/login?next=/feed"
              className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs transition hover:bg-[#E8E0D0]/10"
            >
              Log in
            </Link>
          </div>
        )}
      </div>

      <FeedList items={items} />
    </main>
  );
}
