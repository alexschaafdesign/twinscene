"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Comrade } from "@/lib/comrades";
import { comradeCategoryLabel } from "@/components/comrade-shared";
import { ComradeImage } from "@/components/comrade-shared-client";
import { COMRADE_CATEGORIES, type ComradeCategory } from "@/lib/comradeUtils";
import { iconProps } from "@/components/band-shared";

const CATEGORY_TAGS = COMRADE_CATEGORIES.map((value) => ({
  value,
  label: comradeCategoryLabel(value),
}));

/** Labeled group inside the filter panel. Mirrors MediaProGrid's FilterSection. */
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

/** Removable chip representing one currently-active filter. Mirrors MediaProGrid. */
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

const filterPillBase = "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

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

// Unlike MediaProCard's compact square-image grid tile — photographers and
// videographers are one kind of thing, so a name + role chip says enough —
// comrades are heterogeneous (a studio reads nothing like a label), so each
// card carries a full row layout with room for the tagline: the one-line
// "here's what they actually do" copy that makes an unfamiliar listing
// legible at a glance.
function ComradeCard({ comrade }: { comrade: Comrade }) {
  return (
    <Link
      href={`/comrades/${comrade.slug}`}
      className="animate-fade-in group flex gap-4 rounded-lg border border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/[0.06]"
    >
      <ComradeImage
        comrade={comrade}
        thumb
        className="h-20 w-20 shrink-0 rounded-md ring-1 ring-[#E8E0D0]/10 transition group-hover:ring-[#E8E0D0]/40 sm:h-24 sm:w-24"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-medium leading-snug text-[#E8E0D0]">
          {comrade.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-[#E8E0D0]/55">
          {comradeCategoryLabel(comrade.category)}
          {comrade.city ? ` · ${comrade.city}` : ""}
        </p>
        {comrade.tagline && (
          <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-[#E8E0D0]/70">
            {comrade.tagline}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function ComradeGrid({
  comrades,
  intro,
  fixedCategory,
}: {
  comrades: Comrade[];
  intro?: ReactNode;
  // When set (the per-category pages at /comrades/c/<slug>), the category is
  // locked and the category filter UI is dropped — it's the only filter, so a
  // pill panel that can only ever re-select the current category is just noise.
  // Search still works within the category.
  fixedCategory?: ComradeCategory;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  // The full filter set is collapsed behind a "Filters" button by default,
  // same as MediaProGrid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comrades.filter((c) => {
      if (q) {
        const haystack = [c.name, c.city, c.tagline, c.bio, c.instagram].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const effectiveCategory = fixedCategory ?? category;
      if (effectiveCategory && c.category !== effectiveCategory) return false;
      return true;
    });
  }, [comrades, query, category, fixedCategory]);

  const gridKey = `${query}|${fixedCategory ?? category}`;

  const activeFilterCount = category ? 1 : 0;

  function clearAllFilters() {
    setCategory("");
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
                placeholder="Search by name, city, or what they do…"
                className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
              />
              {!fixedCategory && (
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
              )}
            </div>

            {/* Active filters — always visible, even with the panel collapsed */}
            {!fixedCategory && activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {category && (
                  <ActiveFilterChip
                    label={CATEGORY_TAGS.find((t) => t.value === category)?.label ?? category}
                    onRemove={() => setCategory("")}
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
            {!fixedCategory && filtersOpen && (
              <div className="space-y-4 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
                <FilterSection label="Category">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FilterPill label="All" active={category === ""} onClick={() => setCategory("")} />
                    {CATEGORY_TAGS.map((tag) => (
                      <FilterPill
                        key={tag.value}
                        label={tag.label}
                        active={category === tag.value}
                        onClick={() => setCategory((c) => (c === tag.value ? "" : tag.value))}
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

        {intro && <aside className="shrink-0">{intro}</aside>}
      </div>

      <p className="mb-4 text-center text-xs text-[#E8E0D0]/55">
        Showing {filtered.length} of {comrades.length}
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          {comrades.length === 0
            ? "No comrades listed yet — be the first!"
            : "No listings match those filters."}
        </p>
      ) : (
        <div key={gridKey} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((comrade) => (
            <ComradeCard key={comrade.slug} comrade={comrade} />
          ))}
        </div>
      )}
    </div>
  );
}
