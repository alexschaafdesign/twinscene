import type { Metadata } from "next";
import Link from "next/link";
import { getFeed, type FeedItem } from "@/lib/feed";
import { formatStatusAge } from "@/components/statusTime";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Feed — Twin Scene",
  description: "What people in the Twin Cities music scene are up to right now.",
};

// getFeed() reads the DB directly, so force dynamic rendering the same way the
// other directory pages do — otherwise this would prerender once and go stale.
export const dynamic = "force-dynamic";

function FeedRow({ item }: { item: FeedItem }) {
  const displayName = item.user.name?.trim() || `@${item.user.username}`;
  const initial = (displayName.replace("@", "")[0] || "?").toUpperCase();

  return (
    <li className="flex items-start gap-3 border-b border-[#E8E0D0]/10 py-4 last:border-b-0">
      <Link
        href={`/u/${item.user.username}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-sm font-medium text-[#E8E0D0]"
      >
        {item.user.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.user.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#E8E0D0]/90">
          <Link
            href={`/u/${item.user.username}`}
            className="font-medium text-[#E8E0D0] underline-offset-2 hover:underline"
          >
            {displayName}
          </Link>{" "}
          <span className="text-[#E8E0D0]/50">is</span> {item.status}
        </p>
        <p className="mt-0.5 text-xs text-[#E8E0D0]/40">{formatStatusAge(item.at)}</p>
      </div>
    </li>
  );
}

// The scene feed. Only user statuses for now — lib/feed.ts is a union of item
// kinds so more can be folded in later without changing this page much.
export default async function FeedPage() {
  const items = await getFeed();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <BackLink href="/" label="Directory" />
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">Feed</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          What people in the scene are up to. Set your own status from{" "}
          <Link href="/profile" className="underline underline-offset-2 hover:text-[#E8E0D0]">
            your profile
          </Link>
          .
        </p>
      </header>

      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#E8E0D0]/60">
          Nothing here yet — be the first to{" "}
          <Link href="/profile" className="underline underline-offset-2 hover:text-[#E8E0D0]">
            set a status
          </Link>
          .
        </p>
      )}
    </main>
  );
}
