"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Band } from "@/lib/fetchBands";
import { iconProps, PlaceLine } from "@/components/band-shared";
import { BandImage } from "@/components/band-shared-client";

const LOCATION_TAGS = ["All", "Minneapolis", "St. Paul", "Other"];

// How many genre / neighborhood pills to show before the rest collapse
// behind "See more".
const COLLAPSED_GENRE_COUNT = 12;
const COLLAPSED_NEIGHBORHOOD_COUNT = 10;

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

function BandCard({ band }: { band: Band }) {
  return (
    <Link
      href={`/bands/${band.slug}`}
      className="animate-fade-in group flex flex-col text-left transition-opacity"
    >
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
  );
}

/** Compact list row: small thumbnail + name/meta on one line. */
function BandRow({ band }: { band: Band }) {
  return (
    <Link
      href={`/bands/${band.slug}`}
      className="animate-fade-in group flex w-full items-center gap-3 rounded-md border border-[#E8E0D0]/10 px-3 py-2 text-left transition hover:border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/5"
    >
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
  );
}

export default function BandGrid({
  bands,
  intro,
  bandsWithUpcomingShows,
  bandsWithVideos,
}: {
  bands: Band[];
  intro?: ReactNode;
  // Slugs of bands with an upcoming show. Undefined (Shows feature disabled)
  // hides the filter entirely rather than rendering it against an empty set.
  bandsWithUpcomingShows?: string[];
  // Slugs of bands with at least one visible video. Undefined hides the
  // filter entirely rather than rendering it against an empty set.
  bandsWithVideos?: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Genres are multi-select: a band matches if it has ANY of the chosen ones.
  // Empty = no genre filter (the "All" pill).
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [location, setLocation] = useState("All");
  const [upcomingShowsOnly, setUpcomingShowsOnly] = useState(false);
  const [hasVideosOnly, setHasVideosOnly] = useState(false);
  // Neighborhood sub-filter (multi-select), scoped to the chosen city bucket.
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    [],
  );
  const [showAllNeighborhoods, setShowAllNeighborhoods] = useState(false);
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

  // When collapsed, show the top N — plus any selected genre that falls beyond
  // the cutoff, so an active filter never hides itself.
  const visibleGenres = useMemo(() => {
    if (showAllGenres) return genreOptions;
    const head = genreOptions.slice(0, COLLAPSED_GENRE_COUNT);
    const headLabels = new Set(head.map((g) => g.label));
    const selectedExtras = genreOptions.filter(
      (g) => !headLabels.has(g.label) && selectedGenres.includes(g.label),
    );
    return [...head, ...selectedExtras];
  }, [genreOptions, showAllGenres, selectedGenres]);

  const hiddenGenreCount = genreOptions.length - visibleGenres.length;

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

  // Collapsed view: the top N plus any selected neighborhood past the cutoff,
  // so an active filter never hides itself.
  const visibleNeighborhoods = useMemo(() => {
    if (showAllNeighborhoods) return neighborhoodOptions;
    const head = neighborhoodOptions.slice(0, COLLAPSED_NEIGHBORHOOD_COUNT);
    const headLabels = new Set(head.map((n) => n.label));
    const selectedExtras = neighborhoodOptions.filter(
      (n) =>
        !headLabels.has(n.label) && selectedNeighborhoods.includes(n.label),
    );
    return [...head, ...selectedExtras];
  }, [neighborhoodOptions, showAllNeighborhoods, selectedNeighborhoods]);

  const hiddenNeighborhoodCount =
    neighborhoodOptions.length - visibleNeighborhoods.length;

  function toggleNeighborhood(label: string) {
    setSelectedNeighborhoods((prev) =>
      prev.includes(label)
        ? prev.filter((n) => n !== label)
        : [...prev, label],
    );
  }

  // Switching the city bucket clears neighborhood picks (they're city-specific)
  // and re-collapses the list.
  function chooseLocation(tag: string) {
    setLocation(tag);
    setSelectedNeighborhoods([]);
    setShowAllNeighborhoods(false);
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

  // Key changes whenever filters change, remounting the grid to replay the fade.
  const gridKey = `${query}|${selectedGenres.join(",")}|${location}|${selectedNeighborhoods.join(",")}|${upcomingShowsOnly}|${hasVideosOnly}`;

  function surpriseMe() {
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    router.push(`/bands/${filtered[idx].slug}`);
  }

  const filterPillBase =
    "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

  return (
    <div>
      {/* Controls on the left, the intro/CTA stacked in a column on the right
          so the grid isn't pushed down the page. Stacks on narrow screens. */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, genre, location, or member…"
            className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={surpriseMe}
            disabled={filtered.length === 0}
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

        {/* Genre tags — multi-select, derived from submitted genres */}
        <div className="flex flex-wrap gap-1.5">
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
          {visibleGenres.map(({ label }) => {
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
          {(hiddenGenreCount > 0 || showAllGenres) && (
            <button
              type="button"
              onClick={() => setShowAllGenres((v) => !v)}
              className={`${filterPillBase} border-dashed border-[#E8E0D0]/40 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/70`}
            >
              {showAllGenres ? "See less" : `See more (${hiddenGenreCount})`}
            </button>
          )}
          {selectedGenres.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedGenres([])}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#E8E0D0]/60 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              {/* ti-x (Tabler) */}
              <svg {...iconProps} width={13} height={13}>
                <path d="M18 6l-12 12" />
                <path d="M6 6l12 12" />
              </svg>
              Clear {selectedGenres.length} selected
            </button>
          )}
        </div>

        {/* Location — top-level city bucket (single-select) */}
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

        {/* Toggle filters — upcoming shows only shown when Shows data was
            provided (the Shows feature is enabled); has videos only shown
            when there's at least one band with a video. */}
        {(bandsWithUpcomingShows || bandsWithVideos) && (
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
        )}

        {/* Neighborhoods — city-scoped sub-filter (multi-select), popular
            ones surfaced with the rest behind "See more" */}
        {neighborhoodOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs uppercase tracking-wide text-[#E8E0D0]/40">
              Neighborhoods
            </span>
            {visibleNeighborhoods.map(({ label }) => {
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
            {selectedNeighborhoods.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedNeighborhoods([])}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#E8E0D0]/60 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
              >
                {/* ti-x (Tabler) */}
                <svg {...iconProps} width={13} height={13}>
                  <path d="M18 6l-12 12" />
                  <path d="M6 6l12 12" />
                </svg>
                Clear {selectedNeighborhoods.length} selected
              </button>
            )}
          </div>
        )}
      </div>

        <div className="mt-4 flex items-center gap-3">
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
        Showing {filtered.length} of {bands.length} bands
      </p>

      {filtered.length === 0 ? (
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
          {filtered.map((band) => (
            <BandCard key={band.slug} band={band} />
          ))}
        </div>
      ) : (
        <div
          key={gridKey}
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((band) => (
            <BandRow key={band.slug} band={band} />
          ))}
        </div>
      )}
    </div>
  );
}
