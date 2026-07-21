"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Venue } from "@/lib/fetchVenues";
import { VenuePlaceLine } from "@/components/venue-shared";
import VenueAvatar from "@/components/VenueAvatar";
import { autoInitials } from "@/lib/venueColor";
import { iconProps } from "@/components/band-shared";

const LOCATION_TAGS = ["All", "Minneapolis", "St. Paul", "Other"];

// How many type / neighborhood pills to show before the rest collapse behind
// "See more". Mirrors BandGrid's genre/neighborhood collapse thresholds.
const COLLAPSED_TYPE_COUNT = 10;
const COLLAPSED_NEIGHBORHOOD_COUNT = 10;

/** Does a venue's city match one of the top-level location buckets? */
function matchesLocation(city: string, filter: string): boolean {
  if (filter === "All") return true;
  const loc = city.toLowerCase();

  const isMinneapolis = loc.includes("minneapolis");
  const isStPaul =
    loc.includes("st. paul") ||
    loc.includes("st paul") ||
    loc.includes("saint paul");

  switch (filter) {
    case "Minneapolis":
      return isMinneapolis;
    case "St. Paul":
      return isStPaul;
    case "Other":
      return !isMinneapolis && !isStPaul;
    default:
      return true;
  }
}

function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Link
      href={`/venues/${venue.slug}`}
      className="animate-fade-in group flex flex-col text-left transition-opacity"
    >
      <VenueAvatar
        slug={venue.slug}
        initials={venue.avatarInitials || autoInitials(venue.name)}
        className="rounded-sm ring-1 ring-[#E8E0D0]/10 transition group-hover:ring-[#E8E0D0]/40"
      />
      <h3 className="mt-2.5 truncate text-sm font-medium leading-snug">
        {venue.shortName || venue.name}
      </h3>
      <VenuePlaceLine venue={venue} className="mt-1 text-xs" />
      {(venue.type || venue.capacity != null) && (
        <p className="mt-1 truncate text-xs italic text-[#E8E0D0]/45">
          {[venue.type, venue.capacity != null ? `Cap. ${venue.capacity}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </Link>
  );
}

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

export default function VenueGrid({
  venues,
  intro,
}: {
  venues: Venue[];
  intro?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("All");
  const [selectedType, setSelectedType] = useState("");
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [showAllNeighborhoods, setShowAllNeighborhoods] = useState(false);
  // The full filter set is collapsed behind a "Filters" button by default,
  // same as BandGrid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Distinct types (with counts), busiest first, then alphabetical.
  const typeOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of venues) {
      if (!v.type) continue;
      map.set(v.type, (map.get(v.type) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [venues]);

  const visibleTypes = useMemo(() => {
    if (showAllTypes) return typeOptions;
    const head = typeOptions.slice(0, COLLAPSED_TYPE_COUNT);
    const headTypes = new Set(head.map((t) => t.type));
    const selectedExtra = typeOptions.find(
      (t) => !headTypes.has(t.type) && t.type === selectedType,
    );
    return selectedExtra ? [...head, selectedExtra] : head;
  }, [typeOptions, showAllTypes, selectedType]);

  const hiddenTypeCount = typeOptions.length - visibleTypes.length;

  // Neighborhoods scoped to the chosen city bucket, same idea as BandGrid.
  const neighborhoodOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of venues) {
      if (!v.neighborhood || !matchesLocation(v.city, location)) continue;
      map.set(v.neighborhood, (map.get(v.neighborhood) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([n, count]) => ({ n, count }))
      .sort((a, b) => b.count - a.count || a.n.localeCompare(b.n));
  }, [venues, location]);

  const visibleNeighborhoods = useMemo(() => {
    if (showAllNeighborhoods) return neighborhoodOptions;
    const head = neighborhoodOptions.slice(0, COLLAPSED_NEIGHBORHOOD_COUNT);
    const headNames = new Set(head.map((n) => n.n));
    const selectedExtra = neighborhoodOptions.find(
      (n) => !headNames.has(n.n) && n.n === selectedNeighborhood,
    );
    return selectedExtra ? [...head, selectedExtra] : head;
  }, [neighborhoodOptions, showAllNeighborhoods, selectedNeighborhood]);

  const hiddenNeighborhoodCount =
    neighborhoodOptions.length - visibleNeighborhoods.length;

  function chooseLocation(tag: string) {
    setLocation(tag);
    setSelectedNeighborhood("");
    setShowAllNeighborhoods(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((venue) => {
      if (q) {
        const haystack = [
          venue.name,
          venue.city,
          venue.neighborhood,
          venue.type,
          venue.owner,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (!matchesLocation(venue.city, location)) return false;
      if (selectedType && venue.type !== selectedType) return false;
      if (selectedNeighborhood && venue.neighborhood !== selectedNeighborhood) {
        return false;
      }
      return true;
    });
  }, [venues, query, location, selectedType, selectedNeighborhood]);

  const gridKey = `${query}|${location}|${selectedType}|${selectedNeighborhood}`;

  const activeFilterCount =
    (location !== "All" ? 1 : 0) +
    (selectedType ? 1 : 0) +
    (selectedNeighborhood ? 1 : 0);

  function clearAllFilters() {
    setLocation("All");
    setSelectedType("");
    setShowAllTypes(false);
    setSelectedNeighborhood("");
    setShowAllNeighborhoods(false);
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
            placeholder="Search by name, neighborhood, or type…"
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
            {location !== "All" && (
              <ActiveFilterChip label={location} onRemove={() => chooseLocation("All")} />
            )}
            {selectedType && (
              <ActiveFilterChip label={selectedType} onRemove={() => setSelectedType("")} />
            )}
            {selectedNeighborhood && (
              <ActiveFilterChip
                label={selectedNeighborhood}
                onRemove={() => setSelectedNeighborhood("")}
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
            <FilterSection label="Location">
              <div className="flex flex-wrap items-center gap-1.5">
                {LOCATION_TAGS.map((tag) => (
                  <FilterPill
                    key={tag}
                    label={tag}
                    active={location === tag}
                    onClick={() => chooseLocation(tag)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* Type — single-select, sheet-driven vocabulary */}
            {typeOptions.length > 0 && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Type">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FilterPill
                      label="All types"
                      active={selectedType === ""}
                      onClick={() => setSelectedType("")}
                    />
                    {visibleTypes.map(({ type }) => (
                      <FilterPill
                        key={type}
                        label={type}
                        active={selectedType === type}
                        onClick={() =>
                          setSelectedType((t) => (t === type ? "" : type))
                        }
                      />
                    ))}
                    {(hiddenTypeCount > 0 || showAllTypes) && (
                      <button
                        type="button"
                        onClick={() => setShowAllTypes((v) => !v)}
                        className={`${filterPillBase} border-dashed border-[#E8E0D0]/40 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/70`}
                      >
                        {showAllTypes ? "See less" : `See more (${hiddenTypeCount})`}
                      </button>
                    )}
                  </div>
                </FilterSection>
              </>
            )}

            {/* Neighborhood — city-scoped, single-select */}
            {neighborhoodOptions.length > 0 && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Neighborhood">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FilterPill
                      label="All"
                      active={selectedNeighborhood === ""}
                      onClick={() => setSelectedNeighborhood("")}
                    />
                    {visibleNeighborhoods.map(({ n }) => (
                      <FilterPill
                        key={n}
                        label={n}
                        active={selectedNeighborhood === n}
                        onClick={() =>
                          setSelectedNeighborhood((cur) => (cur === n ? "" : n))
                        }
                      />
                    ))}
                    {(hiddenNeighborhoodCount > 0 || showAllNeighborhoods) && (
                      <button
                        type="button"
                        onClick={() => setShowAllNeighborhoods((v) => !v)}
                        className={`${filterPillBase} border-dashed border-[#E8E0D0]/40 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/70`}
                      >
                        {showAllNeighborhoods
                          ? "See less"
                          : `See more (${hiddenNeighborhoodCount})`}
                      </button>
                    )}
                  </div>
                </FilterSection>
              </>
            )}

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
        Showing {filtered.length} of {venues.length} venues
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          No venues match those filters.
        </p>
      ) : (
        <div
          key={gridKey}
          className="grid gap-x-4 gap-y-7"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {filtered.map((venue) => (
            <VenueCard key={venue.slug} venue={venue} />
          ))}
        </div>
      )}
    </div>
  );
}
