"use client";

import { useState } from "react";
import Link from "next/link";
import type { FeedItem, FollowFeedItem } from "@/lib/feed";
import { formatStatusAge } from "./statusTime";

function displayNameFor(user: FeedItem["user"]): string {
  return user.name?.trim() || `@${user.username}`;
}

/** Per-kind badge shown above each row's copy. Keyed as a Record over
 * FeedItem["kind"] so adding a new feed item kind without an entry here is a
 * type error, not a silently unlabeled row. */
const KIND_BADGE: Record<FeedItem["kind"], { label: string; className: string }> = {
  status: { label: "Status", className: "bg-[#E8B84B]/15 text-[#E8B84B]" },
  follow: { label: "Activity", className: "bg-[#E8E0D0]/10 text-[#E8E0D0]/45" },
};

/** Avatar + timestamp shell shared by every item kind; `children` is the one
 * line of copy that differs per kind. Statuses — what someone deliberately
 * said about themselves — get a gold accent bar, tinted background, and
 * "Status" badge; everything else (follows today, more kinds later) renders
 * quieter so the two read as visually distinct tiers, not one flat list. */
function FeedRow({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const name = displayNameFor(item.user);
  const initial = (name.replace("@", "")[0] || "?").toUpperCase();
  const badge = KIND_BADGE[item.kind];
  const isStatus = item.kind === "status";

  return (
    <li
      className={`flex items-start gap-3.5 border-b border-l-2 border-[#E8E0D0]/10 py-4 pl-3.5 pr-1 last:border-b-0 ${
        isStatus ? "border-l-[#E8B84B]/50 bg-[#E8B84B]/[0.04]" : "border-l-transparent"
      }`}
    >
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
        <span
          className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
        <p className={isStatus ? "text-sm text-[#E8E0D0]/90" : "text-sm text-[#E8E0D0]/65"}>{children}</p>
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

type Filter = "all" | "status";

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active ? "bg-[#E8E0D0]/15 text-[#E8E0D0]" : "text-[#E8E0D0]/50 hover:text-[#E8E0D0]/80"
      }`}
    >
      {children}
    </button>
  );
}

/** The feed list plus its "Everything" / "Statuses only" filter. Client-side
 * because the full item set is already fetched server-side (a feed page is
 * small enough not to need pagination yet) — filtering here avoids a
 * round-trip every time someone flips the toggle. */
export default function FeedList({ items }: { items: FeedItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filter === "status" ? items.filter((item) => item.kind === "status") : items;

  return (
    <>
      <div className="mb-5 inline-flex items-center gap-1 rounded-full border border-[#E8E0D0]/20 p-0.5">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          Everything
        </FilterButton>
        <FilterButton active={filter === "status"} onClick={() => setFilter("status")}>
          Statuses only
        </FilterButton>
      </div>

      {filtered.length > 0 ? (
        <ul className="flex flex-col">
          {filtered.map((item) => (
            <FeedItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : filter === "status" ? (
        <p className="text-sm text-[#E8E0D0]/60">No statuses yet.</p>
      ) : (
        <p className="text-sm text-[#E8E0D0]/60">
          Nothing here yet — be the first to set a status above.
        </p>
      )}
    </>
  );
}
