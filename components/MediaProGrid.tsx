"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { MediaPro } from "@/lib/mediaPros";
import { mediaProRoleLabel } from "@/components/media-pro-shared";
import { MediaProImage } from "@/components/media-pro-shared-client";
import { iconProps } from "@/components/band-shared";

const ROLE_TAGS: { value: string; label: string }[] = [
  { value: "photographer", label: "Photographers" },
  { value: "videographer", label: "Videographers" },
  { value: "both", label: "Both" },
];

/** Labeled group inside the filter panel. Mirrors BandGrid's FilterSection. */
function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#E8E0D0]/40">
        {label}
      </h3>
      {children}
    </div>
  );
}

/** Removable chip representing one currently-active filter. Mirrors BandGrid. */
function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D0]/30 bg-[#E8E0D0]/10 px-2.5 py-1 text-xs text-[#E8E0D0]/85 transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/15"
    >
      {label}
      {/* ti-x (Tabler) */}
      <svg {...iconProps} width={12} height={12}>
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  );
}

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
  const [role, setRole] = useState("");
  // The full filter set is collapsed behind a "Filters" button by default,
  // same as BandGrid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mediaPros.filter((mp) => {
      if (q) {
        const haystack = [mp.name, mp.city, mp.bio, mp.instagram].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (role && mp.role !== role) return false;
      return true;
    });
  }, [mediaPros, query, role]);

  const gridKey = `${query}|${role}`;

  const activeFilterCount = role ? 1 : 0;

  function clearAllFilters() {
    setRole("");
  }

  return (
    <div>
      {/* Controls on the left, the intro/CTA stacked in a column on the right
          so the grid isn't pushed down the page. Stacks on narrow screens. */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
      <div className="space-y-3">
        {/* Search + filters toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or Instagram…"
            className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm transition ${
              filtersOpen
                ? "border-[#E8E0D0]/70 bg-[#E8E0D0]/10"
                : "border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/10"
            }`}
          >
            {/* ti-adjustments-horizontal (Tabler) */}
            <svg {...iconProps} width={16} height={16}>
              <path d="M4 6l8 0" />
              <path d="M16 6l4 0" />
              <path d="M4 12l2 0" />
              <path d="M10 12l10 0" />
              <path d="M4 18l11 0" />
              <path d="M18 18l2 0" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="8" cy="12" r="2" />
              <circle cx="16" cy="18" r="2" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#E8E0D0] px-1 text-[10px] font-semibold text-[#2A2420]">
                {activeFilterCount}
              </span>
            )}
            {/* ti-chevron-down (Tabler) */}
            <svg
              {...iconProps}
              width={14}
              height={14}
              className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6l6 -6" />
            </svg>
          </button>
        </div>

        {/* Active filters — always visible, even with the panel collapsed */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {role && (
              <ActiveFilterChip
                label={ROLE_TAGS.find((t) => t.value === role)?.label ?? role}
                onRemove={() => setRole("")}
              />
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2 py-1 text-xs text-[#E8E0D0]/50 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Full filter panel — collapsed by default, opened via the Filters button */}
        {filtersOpen && (
          <div className="space-y-4 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
            <FilterSection label="Role">
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterPill label="All" active={role === ""} onClick={() => setRole("")} />
                {ROLE_TAGS.map((tag) => (
                  <FilterPill
                    key={tag.value}
                    label={tag.label}
                    active={role === tag.value}
                    onClick={() => setRole((r) => (r === tag.value ? "" : tag.value))}
                  />
                ))}
              </div>
            </FilterSection>

            <div className="flex justify-end border-t border-[#E8E0D0]/10 pt-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs transition hover:bg-[#E8E0D0]/10"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

        {intro && (
          <aside className="shrink-0">{intro}</aside>
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
