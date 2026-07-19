"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { MediaPro } from "@/lib/mediaPros";
import { mediaProRoleLabel } from "@/components/media-pro-shared";
import { MediaProImage } from "@/components/media-pro-shared-client";

const ROLE_TAGS: { value: string; label: string }[] = [
  { value: "All", label: "All" },
  { value: "photographer", label: "Photographers" },
  { value: "videographer", label: "Videographers" },
  { value: "both", label: "Both" },
];

const filterPillBase =
  "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${filterPillBase} ${
        active
          ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
          : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
      }`}
    >
      {label}
    </button>
  );
}

function MediaProCard({ mediaPro }: { mediaPro: MediaPro }) {
  return (
    <Link
      href={`/photo-video/${mediaPro.slug}`}
      className="animate-fade-in group flex flex-col text-left transition-opacity"
    >
      <MediaProImage
        mediaPro={mediaPro}
        thumb
        className="rounded-sm ring-1 ring-[#E8E0D0]/10 transition group-hover:ring-[#E8E0D0]/40"
      />
      <h3 className="mt-2.5 truncate text-sm font-medium leading-snug">
        {mediaPro.name}
      </h3>
      {mediaPro.city && (
        <p className="mt-1 truncate text-xs text-[#E8E0D0]/55">{mediaPro.city}</p>
      )}
      <p className="mt-1 truncate text-xs italic text-[#E8E0D0]/45">
        {mediaProRoleLabel(mediaPro.role)}
      </p>
    </Link>
  );
}

export default function MediaProGrid({
  mediaPros,
  intro,
}: {
  mediaPros: MediaPro[];
  intro?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mediaPros.filter((mp) => {
      if (q) {
        const haystack = [mp.name, mp.city, mp.bio, mp.instagram].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (role !== "All" && mp.role !== role) return false;
      return true;
    });
  }, [mediaPros, query, role]);

  const gridKey = `${query}|${role}`;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="space-y-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, city, or Instagram…"
              className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {ROLE_TAGS.map((tag) => (
                <FilterPill
                  key={tag.value}
                  label={tag.label}
                  active={role === tag.value}
                  onClick={() => setRole(tag.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {intro && (
          <aside className="shrink-0 rounded-lg border border-[#E8E0D0]/10 bg-[#E8E0D0]/[0.03] p-4 lg:w-72 lg:max-w-xs">
            {intro}
          </aside>
        )}
      </div>

      <p className="mb-4 text-center text-xs text-[#E8E0D0]/55">
        Showing {filtered.length} of {mediaPros.length}
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          {mediaPros.length === 0
            ? "No photographers or videographers listed yet — be the first!"
            : "No listings match those filters."}
        </p>
      ) : (
        <div
          key={gridKey}
          className="grid gap-x-4 gap-y-7"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {filtered.map((mediaPro) => (
            <MediaProCard key={mediaPro.slug} mediaPro={mediaPro} />
          ))}
        </div>
      )}
    </div>
  );
}
