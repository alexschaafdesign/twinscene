"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Band } from "@/lib/fetchBands";

const GENRE_TAGS = [
  "All",
  "Punk",
  "Indie",
  "Folk",
  "Rock",
  "Pop",
  "Jazz",
  "Electronic",
  "Hip-Hop",
  "Experimental",
  "Metal",
  "Country",
  "Americana",
];

const LOCATION_TAGS = ["All", "Minneapolis", "St. Paul", "Twin Cities", "Other"];

/** Does a band's location match one of the named location buckets? */
function matchesLocation(location: string, filter: string): boolean {
  if (filter === "All") return true;
  const loc = location.toLowerCase();

  const isMinneapolis = loc.includes("minneapolis");
  const isStPaul =
    loc.includes("st. paul") ||
    loc.includes("st paul") ||
    loc.includes("saint paul");
  const isTwinCities = loc.includes("twin cities");

  switch (filter) {
    case "Minneapolis":
      return isMinneapolis;
    case "St. Paul":
      return isStPaul;
    case "Twin Cities":
      return isTwinCities;
    case "Other":
      return !isMinneapolis && !isStPaul && !isTwinCities;
    default:
      return true;
  }
}

/** First letters of the band's name words, up to two, for the placeholder. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function statusColor(status: string): string | null {
  switch (status) {
    case "Active":
      return "#6FBF73";
    case "On hiatus":
      return "#D9A441";
    case "Disbanded":
      return "#8C8378";
    default:
      return null;
  }
}

/** Square band image with an initials fallback when missing or broken. */
function BandImage({
  band,
  className = "",
}: {
  band: Band;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = band.image && !errored;

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#3A332D] ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- band art comes from arbitrary external hosts
        <img
          src={band.image}
          alt={band.name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
            {initials(band.name)}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = statusColor(status);
  if (!color) return null;
  return (
    <span
      title={status}
      aria-label={status}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function metaLine(band: Band): string {
  const parts: string[] = [];
  if (band.location) parts.push(band.location);
  if (band.started) parts.push(`Est. ${band.started}`);
  return parts.join(" · ");
}

function BandCard({
  band,
  onClick,
}: {
  band: Band;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-fade-in group flex flex-col text-left transition-opacity"
    >
      <BandImage
        band={band}
        className="rounded-sm ring-1 ring-[#E8E0D0]/10 transition group-hover:ring-[#E8E0D0]/40"
      />
      <div className="mt-2.5 flex items-center gap-1.5">
        <StatusDot status={band.status} />
        <h3 className="truncate text-sm font-medium leading-snug">
          {band.name}
        </h3>
      </div>
      {metaLine(band) && (
        <p className="mt-0.5 truncate text-xs text-[#E8E0D0]/55">
          {metaLine(band)}
        </p>
      )}
      {band.genres.length > 0 && (
        <p className="mt-1 truncate text-xs italic text-[#E8E0D0]/45">
          {band.genres.join(", ")}
        </p>
      )}
    </button>
  );
}

/* --- Link icon buttons for the detail drawer --- */

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E8E0D0]/25 text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0]"
    >
      {children}
    </a>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function BandLinks({ band }: { band: Band }) {
  const hasAny =
    band.website || band.instagram || band.bandcamp || band.spotify;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-2.5">
      {band.website && (
        <IconLink href={ensureUrl(band.website)} label="Website">
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
          </svg>
        </IconLink>
      )}
      {band.instagram && (
        <IconLink
          href={`https://instagram.com/${band.instagram}`}
          label={`Instagram @${band.instagram}`}
        >
          <svg {...iconProps}>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
          </svg>
        </IconLink>
      )}
      {band.bandcamp && (
        <IconLink href={ensureUrl(band.bandcamp)} label="Bandcamp">
          <svg {...iconProps}>
            <path d="M4 16l5-8h11l-5 8z" />
          </svg>
        </IconLink>
      )}
      {band.spotify && (
        <IconLink href={ensureUrl(band.spotify)} label="Spotify">
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M7.5 9.5c3-1 6-1 9 .5M8 13c2.5-.8 5-.6 7 .5M8.5 16c2-.6 4-.4 5.5.4" />
          </svg>
        </IconLink>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  if (!color) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
      style={{ borderColor: `${color}66`, color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {status}
    </span>
  );
}

function BandDetail({
  band,
  open,
  onClose,
}: {
  band: Band | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/*
        Responsive drawer:
        - Mobile (< md): full-screen (inset-0), slides up from the bottom.
        - Desktop (md+): fixed 420px panel, right-anchored, slides in from the right.
        Both transitions are CSS-only via transition-transform.
      */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`fixed inset-0 z-50 flex flex-col bg-[#2A2420] transition-transform duration-300 ease-out md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:border-l md:border-[#E8E0D0]/15 md:shadow-2xl ${
          open
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full"
        }`}
      >
        {band && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-[#E8E0D0]/15 px-5 py-3">
              {/* Mobile: prominent back button */}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80 md:hidden"
              >
                <span aria-hidden>←</span> Back to directory
              </button>

              {/* Desktop: section label */}
              <span className="hidden text-xs uppercase tracking-[0.2em] text-[#E8E0D0]/50 md:inline">
                Band
              </span>

              {/* Desktop: icon close button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hidden h-8 w-8 items-center justify-center rounded-full text-[#E8E0D0]/70 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0] md:flex"
              >
                <svg {...iconProps} width={20} height={20}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mx-auto max-w-xs">
                <BandImage
                  band={band}
                  className="rounded-md ring-1 ring-[#E8E0D0]/10"
                />
              </div>

              <div className="mt-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-medium leading-tight">
                    {band.name}
                  </h2>
                  {metaLine(band) && (
                    <p className="mt-1 text-sm text-[#E8E0D0]/65">
                      {metaLine(band)}
                    </p>
                  )}
                </div>
                <div className="pt-1">
                  <StatusBadge status={band.status} />
                </div>
              </div>

              {band.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {band.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-[#E8E0D0]/85">
                {band.bio || "No bio yet."}
              </p>

              {band.bandcamp && (
                <div className="mt-5">
                  <iframe
                    title={`${band.name} on Bandcamp`}
                    src={ensureUrl(band.bandcamp)}
                    className="h-[120px] w-full rounded-md border border-[#E8E0D0]/15"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="mt-5">
                <BandLinks band={band} />
              </div>
            </div>

            <div className="shrink-0 border-t border-[#E8E0D0]/15 px-5 py-3">
              <Link
                href={`/submit?${new URLSearchParams({
                  correct: "true",
                  band: band.slug,
                  name: band.name,
                  genres: band.genres.join(", "),
                  location: band.location,
                  started: band.started != null ? String(band.started) : "",
                  status: band.status,
                  website: band.website,
                  instagram: band.instagram,
                  bandcamp: band.bandcamp,
                  spotify: band.spotify,
                  bio: band.bio,
                  image: band.image,
                }).toString()}`}
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-md border border-[#E8E0D0]/25 px-3 py-1.5 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0]"
              >
                {/* ti-edit (Tabler) */}
                <svg {...iconProps} width={15} height={15}>
                  <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
                  <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" />
                  <path d="M16 5l3 3" />
                </svg>
                Suggest a correction
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

export default function BandGrid({ bands }: { bands: Band[] }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [location, setLocation] = useState("All");
  const [activeOnly, setActiveOnly] = useState(true);

  const [selected, setSelected] = useState<Band | null>(null);
  // Retain the last-shown band so the drawer keeps its content while sliding
  // out. Updated during render (not in an effect) so it stays in sync with
  // `selected` without an extra commit; it lingers when `selected` is null.
  const [shown, setShown] = useState<Band | null>(null);
  if (selected && selected !== shown) {
    setShown(selected);
  }

  // Close drawer on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bands.filter((band) => {
      // Search across name, genres, location
      if (q) {
        const haystack = [band.name, band.genres.join(" "), band.location]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Genre tag (substring match against self-described genres)
      if (genre !== "All") {
        const genreStr = band.genres.join(" ").toLowerCase();
        if (!genreStr.includes(genre.toLowerCase())) return false;
      }

      // Location bucket
      if (!matchesLocation(band.location, location)) return false;

      // Active-only hides disbanded / on-hiatus bands
      if (activeOnly && (band.status === "Disbanded" || band.status === "On hiatus")) {
        return false;
      }

      return true;
    });
  }, [bands, query, genre, location, activeOnly]);

  // Key changes whenever filters change, remounting the grid to replay the fade.
  const gridKey = `${query}|${genre}|${location}|${activeOnly}`;

  function surpriseMe() {
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    setSelected(filtered[idx]);
  }

  const filterPillBase =
    "rounded-full border px-3 py-1 text-xs transition cursor-pointer";

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, genre, or location…"
            className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={surpriseMe}
            disabled={filtered.length === 0}
            className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🎲 Surprise me
          </button>
        </div>

        {/* Genre tags */}
        <div className="flex flex-wrap gap-1.5">
          {GENRE_TAGS.map((tag) => {
            const active = genre === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setGenre(tag)}
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

        {/* Location + status */}
        <div className="flex flex-wrap items-center gap-1.5">
          {LOCATION_TAGS.map((tag) => {
            const active = location === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setLocation(tag)}
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

          <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-xs text-[#E8E0D0]/70">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#E8E0D0]"
            />
            Active only
          </label>
        </div>
      </div>

      <p className="mb-4 text-xs text-[#E8E0D0]/55">
        Showing {filtered.length} of {bands.length} bands
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          No bands match those filters.
        </p>
      ) : (
        <div
          key={gridKey}
          className="grid gap-x-4 gap-y-7"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {filtered.map((band) => (
            <BandCard
              key={band.slug}
              band={band}
              onClick={() => setSelected(band)}
            />
          ))}
        </div>
      )}

      <BandDetail
        band={shown}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
