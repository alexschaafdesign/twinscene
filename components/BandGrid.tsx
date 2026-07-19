"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Band } from "@/lib/fetchBands";
import { iconProps, PlaceLine } from "@/components/band-shared";
import { BandImage, FollowBandButton } from "@/components/band-shared-client";

const LOCATION_TAGS = ["All", "Minneapolis", "St. Paul", "Other"];

/** Does a band's city match one of the top-level location buckets? */
function matchesLocation(location: string, filter: string): boolean {
  if (filter === "All") return true;
  const loc = location.toLowerCase();

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

/* The heart sits OUTSIDE the card's <Link> — nesting a button inside an
   anchor is invalid HTML and makes the hit target ambiguous. Both are
   children of a relative wrapper, with the heart absolutely positioned over
   the image corner. */
function BandCard({ band, follow }: { band: Band; follow: FollowProps }) {
  return (
    <div className="animate-fade-in group relative flex flex-col text-left">
      <Link href={`/bands/${band.slug}`} className="flex flex-col transition-opacity">
        <BandImage
          band={band}
          thumb
          className="rounded-sm ring-1 ring-[#E8E0D0]/10 transition group-hover:ring-[#E8E0D0]/40"
        />
        <h3 className="mt-2.5 truncate text-sm font-medium leading-snug">
          {band.name}
        </h3>
        <PlaceLine band={band} className="mt-1 text-xs" />
        {band.genres.length > 0 && (
          <p className="mt-1 truncate text-xs italic text-[#E8E0D0]/45">
            {band.genres.join(", ")}
          </p>
        )}
      </Link>
      {/* Always visible once followed, otherwise revealed on hover/focus so
          the grid stays calm. focus-within keeps it keyboard-reachable. */}
      <div
        className={`absolute right-1.5 top-1.5 transition-opacity ${
          follow.following.has(band.slug)
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        }`}
      >
        <HeartFor band={band} follow={follow} />
      </div>
    </div>
  );
}

/** Follow state + toggle, threaded down from BandGrid so every card shares one
 * set rather than each fetching its own. */
type FollowProps = {
  loggedIn: boolean;
  following: Set<string>;
  onToggle: (slug: string, following: boolean) => void;
};

function HeartFor({ band, follow }: { band: Band; follow: FollowProps }) {
  return (
    <FollowBandButton
      slug={band.slug}
      initialFollowing={follow.following.has(band.slug)}
      loggedIn={follow.loggedIn}
      variant="icon"
      nextPath="/"
      onToggle={(next) => follow.onToggle(band.slug, next)}
    />
  );
}

/** Compact list row: small thumbnail + name/meta on one line. */
function BandRow({ band, follow }: { band: Band; follow: FollowProps }) {
  return (
    <div className="animate-fade-in group flex w-full items-center gap-3 rounded-md border border-[#E8E0D0]/10 px-3 py-2 text-left transition hover:border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/5">
      <Link href={`/bands/${band.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
      <div className="h-11 w-11 shrink-0">
        <BandImage band={band} thumb className="rounded-sm ring-1 ring-[#E8E0D0]/10" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium leading-snug">
          {band.name}
        </h3>
        <PlaceLine band={band} className="mt-0.5 text-xs" />
      </div>
        {band.genres.length > 0 && (
          <p className="ml-auto hidden max-w-[40%] shrink-0 truncate text-xs italic text-[#E8E0D0]/45 sm:block">
            {band.genres.join(", ")}
          </p>
        )}
      </Link>
      <div className="shrink-0">
        <HeartFor band={band} follow={follow} />
      </div>
    </div>
  );
}

/** Labeled group inside the filter panel (Genre, Location, Attributes, …). */
function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#E8E0D0]/40">
        {label}
      </h3>
      {children}
    </div>
  );
}

/** Removable chip representing one currently-active filter. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
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

export default function BandGrid({
  bands,
  intro,
  bandsWithUpcomingShows,
  bandsWithVideos,
  loggedIn = false,
  followedSlugs,
}: {
  bands: Band[];
  intro?: ReactNode;
  // Slugs of bands with an upcoming show. Undefined (Shows feature disabled)
  // hides the filter entirely rather than rendering it against an empty set.
  bandsWithUpcomingShows?: string[];
  // Slugs of bands with at least one visible video. Undefined hides the
  // filter entirely rather than rendering it against an empty set.
  bandsWithVideos?: string[];
  // Whether to wire the hearts to the toggle or to a /login link.
  loggedIn?: boolean;
  // Slugs this user already follows, so every card renders the right heart
  // from one query instead of one per card. Empty for logged-out visitors.
  followedSlugs?: string[];
}) {
  const router = useRouter();
  // Held here rather than per-card so a toggle survives re-filtering/sorting,
  // which remounts the cards.
  const [following, setFollowing] = useState<Set<string>>(
    () => new Set(followedSlugs ?? []),
  );
  const follow = useMemo(
    () => ({
      loggedIn,
      following,
      onToggle: (slug: string, next: boolean) =>
        setFollowing((cur) => {
          const updated = new Set(cur);
          if (next) updated.add(slug);
          else updated.delete(slug);
          return updated;
        }),
    }),
    [loggedIn, following],
  );
  const [query, setQuery] = useState("");
  // Genres are multi-select: a band matches if it has ANY of the chosen ones.
  // Empty = no genre filter (the "All" pill).
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [location, setLocation] = useState("All");
  const [upcomingShowsOnly, setUpcomingShowsOnly] = useState(false);
  const [hasVideosOnly, setHasVideosOnly] = useState(false);
  // Neighborhood sub-filter (multi-select), scoped to the chosen city bucket.
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    [],
  );
  // The full filter set is collapsed behind a "Filters" button by default.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Ordering of the visible grid. "name" is alphabetical (the default the DB
  // layer already delivers); "recent" surfaces the most recently edited bands.
  const [sort, setSort] = useState<"name" | "recent">("name");
  // Default per breakpoint: gallery on larger screens, compact list on mobile.
  // Starts "gallery" to match SSR, then corrected on mount (see effect below).
  // Once the user picks a view, `viewChosen` stops the breakpoint override.
  const [view, setView] = useState<"gallery" | "compact">("gallery");
  const [viewChosen, setViewChosen] = useState(false);

  function chooseView(v: "gallery" | "compact") {
    setView(v);
    setViewChosen(true);
  }

  // Pick the default view from the viewport width until the user overrides it.
  // 640px is Tailwind's `sm` breakpoint — below it, the compact list reads best.
  useEffect(() => {
    if (viewChosen) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setView(mq.matches ? "compact" : "gallery");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [viewChosen]);

  // Every distinct genre bands have submitted, deduped case-insensitively and
  // ordered by how many bands use it (most common first, then alphabetical).
  const genreOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const band of bands) {
      for (const g of band.genres) {
        const key = g.toLowerCase();
        const existing = map.get(key);
        if (existing) existing.count++;
        else map.set(key, { label: g, count: 1 });
      }
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  }, [bands]);

  function toggleGenre(label: string) {
    setSelectedGenres((prev) =>
      prev.includes(label)
        ? prev.filter((g) => g !== label)
        : [...prev, label],
    );
  }

  // Neighborhoods available within the current city bucket, ordered by how many
  // bands use each (most common first, then alphabetical). Scoped to the city
  // so picking "St. Paul" surfaces St. Paul neighborhoods, not Minneapolis's.
  const neighborhoodOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const band of bands) {
      if (!matchesLocation(band.city, location)) continue;
      for (const n of band.neighborhoods) {
        const key = n.toLowerCase();
        const existing = map.get(key);
        if (existing) existing.count++;
        else map.set(key, { label: n, count: 1 });
      }
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  }, [bands, location]);

  function toggleNeighborhood(label: string) {
    setSelectedNeighborhoods((prev) =>
      prev.includes(label)
        ? prev.filter((n) => n !== label)
        : [...prev, label],
    );
  }

  // Switching the city bucket clears neighborhood picks (they're city-specific).
  function chooseLocation(tag: string) {
    setLocation(tag);
    setSelectedNeighborhoods([]);
  }

  const upcomingShowSlugSet = useMemo(
    () => new Set(bandsWithUpcomingShows ?? []),
    [bandsWithUpcomingShows],
  );

  const videoSlugSet = useMemo(
    () => new Set(bandsWithVideos ?? []),
    [bandsWithVideos],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const genreSet = new Set(selectedGenres.map((g) => g.toLowerCase()));
    const neighborhoodSet = new Set(
      selectedNeighborhoods.map((n) => n.toLowerCase()),
    );
    return bands.filter((band) => {
      // Upcoming shows toggle
      if (upcomingShowsOnly && !upcomingShowSlugSet.has(band.slug)) {
        return false;
      }

      // Has videos toggle
      if (hasVideosOnly && !videoSlugSet.has(band.slug)) {
        return false;
      }

      // Search across name, genres, city, neighborhoods, and members
      if (q) {
        const haystack = [
          band.name,
          band.genres.join(" "),
          band.city,
          band.neighborhoods.join(" "),
          band.members.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Genre — match if the band has ANY of the selected genres.
      if (genreSet.size > 0) {
        const hit = band.genres.some((g) => genreSet.has(g.toLowerCase()));
        if (!hit) return false;
      }

      // Location bucket
      if (!matchesLocation(band.city, location)) return false;

      // Neighborhood — match if the band has ANY of the selected neighborhoods.
      if (neighborhoodSet.size > 0) {
        const hit = band.neighborhoods.some((n) =>
          neighborhoodSet.has(n.toLowerCase()),
        );
        if (!hit) return false;
      }

      return true;
    });
  }, [
    bands,
    query,
    selectedGenres,
    location,
    selectedNeighborhoods,
    upcomingShowsOnly,
    upcomingShowSlugSet,
    hasVideosOnly,
    videoSlugSet,
  ]);

  // Apply the chosen ordering. `filtered` preserves the incoming alphabetical
  // order, so "name" is a no-op; "recent" sorts by last-edit timestamp,
  // newest first (blank timestamps sort last).
  const sorted = useMemo(() => {
    if (sort === "name") return filtered;
    return [...filtered].sort((a, b) => {
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [filtered, sort]);

  // Key changes whenever filters or sort change, remounting the grid to replay
  // the fade.
  const gridKey = `${query}|${selectedGenres.join(",")}|${location}|${selectedNeighborhoods.join(",")}|${upcomingShowsOnly}|${hasVideosOnly}|${sort}`;

  function surpriseMe() {
    if (sorted.length === 0) return;
    const idx = Math.floor(Math.random() * sorted.length);
    router.push(`/bands/${sorted[idx].slug}`);
  }

  const filterPillBase =
    "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

  const activeFilterCount =
    selectedGenres.length +
    (location !== "All" ? 1 : 0) +
    (upcomingShowsOnly ? 1 : 0) +
    (hasVideosOnly ? 1 : 0) +
    selectedNeighborhoods.length;

  function clearAllFilters() {
    setSelectedGenres([]);
    setLocation("All");
    setUpcomingShowsOnly(false);
    setHasVideosOnly(false);
    setSelectedNeighborhoods([]);
  }

  return (
    <div>
      {/* Controls on the left, the intro/CTA stacked in a column on the right
          so the grid isn't pushed down the page. Stacks on narrow screens. */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
      <div className="space-y-3">
        {/* Search + filters toggle + surprise me */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, genre, location, or member…"
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
          <button
            type="button"
            onClick={surpriseMe}
            disabled={sorted.length === 0}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* ti-arrows-shuffle (Tabler) */}
            <svg {...iconProps} width={16} height={16}>
              <path d="M18 4l3 3l-3 3" />
              <path d="M18 20l3 -3l-3 -3" />
              <path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h4" />
              <path d="M3 17h3a5 5 0 0 0 5 -5a5 5 0 0 1 5 -5h4" />
            </svg>
            Surprise me
          </button>
        </div>

        {/* Active filters — always visible, even with the panel collapsed */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedGenres.map((label) => (
              <FilterChip
                key={`genre-${label}`}
                label={label}
                onRemove={() => toggleGenre(label)}
              />
            ))}
            {location !== "All" && (
              <FilterChip label={location} onRemove={() => chooseLocation("All")} />
            )}
            {upcomingShowsOnly && (
              <FilterChip
                label="Has upcoming shows"
                onRemove={() => setUpcomingShowsOnly(false)}
              />
            )}
            {hasVideosOnly && (
              <FilterChip
                label="Has videos"
                onRemove={() => setHasVideosOnly(false)}
              />
            )}
            {selectedNeighborhoods.map((label) => (
              <FilterChip
                key={`neighborhood-${label}`}
                label={label}
                onRemove={() => toggleNeighborhood(label)}
              />
            ))}
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
            <FilterSection label="Genre">
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedGenres([])}
                  className={`${filterPillBase} ${
                    selectedGenres.length === 0
                      ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                      : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                  }`}
                >
                  All
                </button>
                {genreOptions.map(({ label }) => {
                  const active = selectedGenres.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleGenre(label)}
                      className={`${filterPillBase} ${
                        active
                          ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                          : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <div className="border-t border-[#E8E0D0]/10" />

            <FilterSection label="Location">
              <div className="flex flex-wrap items-center gap-1.5">
                {LOCATION_TAGS.map((tag) => {
                  const active = location === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => chooseLocation(tag)}
                      className={`${filterPillBase} ${
                        active
                          ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                          : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            {/* Attributes — upcoming shows only shown when Shows data was
                provided (the Shows feature is enabled); has videos only shown
                when there's at least one band with a video. */}
            {(bandsWithUpcomingShows || bandsWithVideos) && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Attributes">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {bandsWithUpcomingShows && (
                      <button
                        type="button"
                        onClick={() => setUpcomingShowsOnly((v) => !v)}
                        aria-pressed={upcomingShowsOnly}
                        className={`${filterPillBase} ${
                          upcomingShowsOnly
                            ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                            : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                        }`}
                      >
                        Has upcoming shows
                      </button>
                    )}
                    {bandsWithVideos && (
                      <button
                        type="button"
                        onClick={() => setHasVideosOnly((v) => !v)}
                        aria-pressed={hasVideosOnly}
                        className={`${filterPillBase} ${
                          hasVideosOnly
                            ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                            : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                        }`}
                      >
                        Has videos
                      </button>
                    )}
                  </div>
                </FilterSection>
              </>
            )}

            {/* Neighborhoods — city-scoped sub-filter (multi-select) */}
            {neighborhoodOptions.length > 0 && (
              <>
                <div className="border-t border-[#E8E0D0]/10" />
                <FilterSection label="Neighborhood">
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {neighborhoodOptions.map(({ label }) => {
                      const active = selectedNeighborhoods.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleNeighborhood(label)}
                          className={`${filterPillBase} ${
                            active
                              ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                              : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Sort order */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#E8E0D0]/45">Sort</span>
            <div className="flex items-center gap-0.5 rounded-md border border-[#E8E0D0]/20 p-0.5">
              <button
                type="button"
                onClick={() => setSort("name")}
                aria-pressed={sort === "name"}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  sort === "name"
                    ? "bg-[#E8E0D0] text-[#2A2420]"
                    : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
                }`}
              >
                A–Z
              </button>
              <button
                type="button"
                onClick={() => setSort("recent")}
                aria-pressed={sort === "recent"}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  sort === "recent"
                    ? "bg-[#E8E0D0] text-[#2A2420]"
                    : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
                }`}
              >
                Recently updated
              </button>
            </div>
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-[#E8E0D0]/20 p-0.5">
            <button
              type="button"
              onClick={() => chooseView("gallery")}
              aria-pressed={view === "gallery"}
              aria-label="Gallery view"
              title="Gallery view"
              className={`flex h-7 w-7 items-center justify-center rounded transition ${
                view === "gallery"
                  ? "bg-[#E8E0D0] text-[#2A2420]"
                  : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
              }`}
            >
              {/* ti-layout-grid (Tabler) */}
              <svg {...iconProps} width={16} height={16}>
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <rect x="14" y="14" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => chooseView("compact")}
              aria-pressed={view === "compact"}
              aria-label="Compact list view"
              title="Compact list view"
              className={`flex h-7 w-7 items-center justify-center rounded transition ${
                view === "compact"
                  ? "bg-[#E8E0D0] text-[#2A2420]"
                  : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
              }`}
            >
              {/* ti-list (Tabler) */}
              <svg {...iconProps} width={16} height={16}>
                <path d="M9 6l11 0" />
                <path d="M9 12l11 0" />
                <path d="M9 18l11 0" />
                <path d="M5 6l0 .01" />
                <path d="M5 12l0 .01" />
                <path d="M5 18l0 .01" />
              </svg>
            </button>
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
        Showing {sorted.length} of {bands.length} bands
      </p>

      {sorted.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          No bands match those filters.
        </p>
      ) : view === "gallery" ? (
        <div
          key={gridKey}
          className="grid gap-x-4 gap-y-7"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {sorted.map((band) => (
            <BandCard key={band.slug} band={band} follow={follow} />
          ))}
        </div>
      ) : (
        <div
          key={gridKey}
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
        >
          {sorted.map((band) => (
            <BandRow key={band.slug} band={band} follow={follow} />
          ))}
        </div>
      )}
    </div>
  );
}
