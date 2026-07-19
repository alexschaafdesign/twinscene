import type { Metadata } from "next";
import Link from "next/link";
import { getFeed, type FeedItem, type FollowFeedItem } from "@/lib/feed";
import { formatStatusAge } from "@/components/statusTime";

export const metadata: Metadata = {
  title: "Feed — Twin Scene",
  description: "What people in the Twin Cities music scene are up to right now.",
};

// getFeed() reads the DB directly, so force dynamic rendering the same way the
// other directory pages do — otherwise this would prerender once and go stale.
export const dynamic = "force-dynamic";

function displayNameFor(user: FeedItem["user"]): string {
  return user.name?.trim() || `@${user.username}`;
}

/** Avatar + timestamp shell shared by every item kind; `children` is the one
 * line of copy that differs per kind. */
function FeedRow({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const name = displayNameFor(item.user);
  const initial = (name.replace("@", "")[0] || "?").toUpperCase();

  return (
    <li className="flex items-start gap-3.5 border-b border-[#E8E0D0]/10 py-4 last:border-b-0">
      <Link
        href={`/u/${item.user.username}`}
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-base font-medium text-[#E8E0D0]"
      >
        {item.user.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.user.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#E8E0D0]/90">{children}</p>
        <p className="mt-0.5 text-xs text-[#E8E0D0]/40">{formatStatusAge(item.at)}</p>
      </div>
    </li>
  );
}

function UserLink({ user }: { user: FeedItem["user"] }) {
  return (
    <Link
      href={`/u/${user.username}`}
      className="font-medium text-[#E8E0D0] underline-offset-2 hover:underline"
    >
      {displayNameFor(user)}
    </Link>
  );
}

/** "Band A, Band B and 3 others" — the named bands link, the remainder is a
 * plain count since there's nothing useful to point it at. */
function BandList({ item }: { item: FollowFeedItem }) {
  const remainder = item.total - item.bands.length;

  return (
    <>
      {item.bands.map((band, i) => (
        <span key={band.slug}>
          {i > 0 && (i === item.bands.length - 1 && remainder === 0 ? " and " : ", ")}
          <Link
            href={`/bands/${band.slug}`}
            className="text-[#E8E0D0] underline-offset-2 hover:underline"
          >
            {band.name}
          </Link>
        </span>
      ))}
      {remainder > 0 && (
        <span className="text-[#E8E0D0]/60">
          {" "}
          and {remainder} other{remainder === 1 ? "" : "s"}
        </span>
      )}
    </>
  );
}

function FeedItemRow({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "status":
      return (
        <FeedRow item={item}>
          <UserLink user={item.user} /> <span className="text-[#E8E0D0]/50">is</span> {item.status}
        </FeedRow>
      );
    case "follow":
      return (
        <FeedRow item={item}>
          <UserLink user={item.user} />{" "}
          <span className="text-[#E8E0D0]/50">
            {item.total === 1 ? "followed" : `followed ${item.total} bands:`}
          </span>{" "}
          <BandList item={item} />
        </FeedRow>
      );
  }
}

// The scene feed — statuses and band follows. lib/feed.ts is a union of item
// kinds; adding another means a new case in FeedItemRow and nothing else here.
export default async function FeedPage() {
  const items = await getFeed();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Feed</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Statuses and new follows from around the scene. Set your own status
          from{" "}
          <Link href="/profile" className="underline underline-offset-2 hover:text-[#E8E0D0]">
            your profile
          </Link>
          .
        </p>
      </header>

      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <FeedItemRow key={item.id} item={item} />
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
