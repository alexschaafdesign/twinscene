"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { initials } from "@/components/band-shared";

type Mode = "add" | "correct";

const BIO_MAX = 1500;

// Keeps the multipart body comfortably under Vercel Functions' request-body
// cap now that uploads go through our own API route instead of Apps Script.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB

const inputClass =
  "w-full rounded-md border border-ink/20 bg-transparent px-3.5 py-2 text-sm text-ink placeholder:text-ink/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cities that get a one-tap button in the picker; anything else is "Other".
const KNOWN_CITIES = ["Minneapolis", "St. Paul"] as const;

// The four collapsible groups the form is organized into. Used to key open/
// closed accordion state and to know which section to reveal when a field in
// it fails validation.
type SectionKey = "basics" | "musicLinks" | "bioShows" | "aboutYou";

const FIELD_SECTION: Record<string, SectionKey> = {
  bandName: "basics",
  genres: "basics",
  location: "basics",
  website: "musicLinks",
  instagram: "musicLinks",
  bandPhoto: "bioShows",
};

/**
 * Lowercase, collapse non-alphanumeric runs into single hyphens, trim hyphens.
 * Kept in sync with slugify() in lib/fetchBands.ts.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalize a band name for duplicate detection: lowercase, drop a leading
 * "the", strip punctuation, collapse whitespace. Mirrors normalize() in
 * lib/bandMatcher.ts so the form flags the same "same band" cases the scraper
 * treats as matches (e.g. "The Foo!" vs "foo").
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type FormState = {
  bandName: string;
  genres: string;
  similarTo: string; // comma-joined "for fans of" references; parsed like genres
  location: string; // city — persisted to the sheet's LOCATION column
  neighborhoods: string; // comma-joined; parsed into a list like genres
  members: string; // comma-joined band member names; parsed into a list
  contactEmail: string;
  contactMethod: string; // "" | "email" | "instagram" | "website" — preferred contact
  website: string;
  instagram: string;
  bandcamp: string;
  bandcampLink: string;
  bio: string;
  notes: string;
};

// New YouTube videos to attach — dynamic add/remove list.
type VideoInput = { url: string; label: string };

const emptyVideo = (): VideoInput => ({ url: "", label: "" });

// A video already on the band (scraper-matched or previously hand-entered).
// Only populated in "correct" mode. `source` distinguishes the
// UnderCurrentMPLS backfill from a hand-entered submission; `hidden` is the
// video's current on/off state (lib/videos.ts, migration 0044) — toggling it
// off a profile is reversible, unlike the old hard-delete.
type ExistingVideo = {
  id: number;
  url: string;
  title: string;
  source: "manual" | "scraper";
  hidden: boolean;
};

/** Every video row on the band, fetched server-side in "correct" mode
 * (app/submit/page.tsx via lib/videos.ts getAllVideosForBand) — every
 * status, not just the ones currently visible on the live profile, so a
 * submitter can see (and hide, if they choose) a scraper match still
 * pending review. Collapses the status enum to a simple scraper/manual
 * split, which is all the form needs to label provenance. */
function toExistingVideos(
  rows: { id: number; video_url: string; video_title: string; status: string; hidden: boolean }[],
): ExistingVideo[] {
  return rows.map((v) => ({
    id: v.id,
    url: v.video_url,
    title: v.video_title,
    source: v.status === "manual" ? "manual" : "scraper",
    hidden: v.hidden,
  }));
}

// Featured "linktree" links — a fixed set of highlight slots (url + label).
const FEATURED_LINK_SLOTS = 3;

type LinkInput = { url: string; label: string };

/** Seed the fixed slots from the correction round-trip JSON, padded to 3. */
function initialFeaturedLinkSlots(raw: string): LinkInput[] {
  const slots: LinkInput[] = Array.from({ length: FEATURED_LINK_SLOTS }, () => ({
    url: "",
    label: "",
  }));
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      parsed.slice(0, FEATURED_LINK_SLOTS).forEach((l, i) => {
        if (l && typeof l === "object") {
          slots[i] = {
            url: typeof l.url === "string" ? l.url : "",
            label: typeof l.label === "string" ? l.label : "",
          };
        }
      });
    }
  } catch {
    // Malformed input just leaves the blank slots.
  }
  return slots;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-ink"
      >
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-[13px] text-ink/40">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * A titled group of related fields nested inside an accordion section (e.g.
 * "Contact & socials" inside "Music, Links & Video"). A hairline top rule
 * gives adjacent subgroups a subtle break; the first one in a section omits
 * it since the section's own header already provides separation.
 */
function SubGroup({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 border-t border-ink/10 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">
          {label}
        </h3>
        {description && (
          <p className="mt-1 text-[13px] text-ink/45">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Small pill summarizing a section's current values, e.g. "Empty", "3 added",
 * "Instagram set". Muted when empty, accent-colored once something's set, so
 * the accent reads as "this has content" at a glance. */
function StatusChip({ label }: { label: string }) {
  const empty = label === "Empty";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        empty
          ? "border-ink/15 bg-ink/5 text-ink/40"
          : "border-accent/40 bg-accent/15 text-ink"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * A section of the form. When `collapsible` is true it renders as an
 * accordion row (click/Enter/Space to toggle, full aria-expanded/aria-controls
 * wiring); when false it renders as a plain always-open panel with the same
 * header typography, used for the Basics/About You sections in add mode.
 */
function AccordionSection({
  id,
  title,
  description,
  statusChip,
  open,
  onToggle,
  collapsible = true,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  statusChip?: string;
  open: boolean;
  onToggle: () => void;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;
  const showContent = !collapsible || open;

  const headerInner = (
    <div className="flex w-full items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink sm:text-[20px]">
            {title}
          </h2>
          {statusChip && <StatusChip label={statusChip} />}
        </div>
        {description && (
          <p className="mt-1 text-sm text-ink/55">{description}</p>
        )}
      </div>
      {collapsible && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-accent" : "text-ink/40"
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );

  return (
    <section
      className={`overflow-hidden rounded-lg border bg-paper transition-colors ${
        collapsible && open ? "border-accent/40" : "border-ink/15"
      }`}
    >
      {collapsible ? (
        <button
          type="button"
          id={headerId}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center px-4 py-4 text-left sm:px-5"
        >
          {headerInner}
        </button>
      ) : (
        <div id={headerId} className="px-4 py-4 sm:px-5">
          {headerInner}
        </div>
      )}
      {showContent && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className={`space-y-5 px-4 pb-5 sm:px-5 ${
            collapsible ? "border-t border-ink/10 pt-5" : "pt-0"
          }`}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Tag-input with autocomplete. Selected values render as removable chips;
 * typing filters `options`, and an "Add '…'" entry lets the user create a value
 * that isn't in the list yet. Used for both genres and neighborhoods. Value is
 * the array of selected strings.
 */
function TagInput({
  id,
  value,
  options,
  onChange,
  hasError,
  placeholder,
}: {
  id: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  hasError?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = value.map((v) => v.toLowerCase());
  const q = query.trim();
  const qLower = q.toLowerCase();

  const matches = options.filter(
    (o) =>
      !selectedLower.includes(o.toLowerCase()) &&
      (qLower === "" || o.toLowerCase().includes(qLower)),
  );
  const exactExists =
    q !== "" &&
    (options.some((o) => o.toLowerCase() === qLower) ||
      selectedLower.includes(qLower));
  const showAdd = q !== "" && !exactExists;

  type Item = { type: "existing" | "add"; value: string };
  const items: Item[] = [
    ...matches.map((m) => ({ type: "existing" as const, value: m })),
    ...(showAdd ? [{ type: "add" as const, value: q }] : []),
  ];

  // Keep the highlighted index in range as the item list changes, without
  // storing derived state (the raw `highlight` may briefly point past the end).
  const activeIndex = highlight < items.length ? highlight : 0;

  // Close the dropdown on any click outside the component.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!selectedLower.includes(trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      removeTag(value.length - 1);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (items.length ? (h + 1) % items.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        items.length ? (h - 1 + items.length) % items.length : 0,
      );
      return;
    }
    if (e.key === "Enter") {
      if (open && items.length > 0) {
        e.preventDefault();
        addTag(items[activeIndex]?.value ?? "");
      } else if (q) {
        // Don't submit the form while a value is half-typed.
        e.preventDefault();
        addTag(q);
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[2.6rem] w-full flex-wrap items-center gap-1.5 rounded-md border ${
          hasError ? "border-danger/60" : "border-ink/20"
        } bg-transparent px-2 py-1.5 text-sm transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-accent`}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-ink/15 px-2 py-0.5 text-xs text-ink"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="text-ink/60 transition hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 bg-transparent text-ink placeholder:text-ink/35 focus:outline-none"
        />
      </div>

      {open && items.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-ink/20 bg-paper py-1 shadow-lg">
          {items.map((item, i) => (
            <li key={item.type === "add" ? `__add__${item.value}` : item.value}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // Select before the input blurs and closes the dropdown.
                  e.preventDefault();
                  addTag(item.value);
                }}
                className={`block w-full px-3 py-2 text-left text-sm text-ink ${
                  i === activeIndex ? "bg-ink/10" : ""
                } ${item.type === "add" ? "italic text-ink/80" : ""}`}
              >
                {item.type === "add" ? `+ Add '${item.value}'` : item.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Small live preview of how the band will look as a directory card, styled to
 * match BandCard in BandGrid.tsx exactly (dark card on the page background,
 * not the light paper form panel) so it reads as "this is the real card,"
 * not form chrome. `photoUrl` is whichever image currently wins: a freshly
 * selected file, the existing photo (correction mode), or nothing.
 */
function LivePreviewCard({
  name,
  genres,
  neighborhoods,
  city,
  photoUrl,
}: {
  name: string;
  genres: string[];
  neighborhoods: string[];
  city: string;
  photoUrl: string | null;
}) {
  const hasHoods = neighborhoods.length > 0;
  const hasPlace = hasHoods || !!city;
  return (
    <div className="flex flex-col text-left">
      <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#3A332D] ring-1 ring-[#E8E0D0]/10">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="select-none text-4xl font-medium text-[#E8E0D0]/30">
              {initials(name || "Your Band")}
            </span>
          </div>
        )}
      </div>
      <h3 className="mt-2.5 truncate text-sm font-medium leading-snug text-[#E8E0D0]">
        {name || "Your band name"}
      </h3>
      {hasPlace && (
        <p className="mt-1 truncate text-xs text-[#E8E0D0]/55">
          {hasHoods && (
            <span className="text-[#E8E0D0]/85">{neighborhoods.join(", ")}</span>
          )}
          {hasHoods && city ? ", " : ""}
          {city}
        </p>
      )}
      {genres.length > 0 && (
        <p className="mt-1 truncate text-xs italic text-[#E8E0D0]/45">
          {genres.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function SubmitForm({
  mode = "add",
  initialSlug = "",
  initialName = "",
  initialGenres = "",
  initialSimilarTo = "",
  initialLocation = "",
  initialNeighborhoods = "",
  initialMembers = "",
  initialContactEmail = "",
  initialContactMethod = "",
  initialWebsite = "",
  initialInstagram = "",
  initialBandcamp = "",
  initialBandcampLink = "",
  initialBio = "",
  initialImage = "",
  initialFeaturedLinks = "",
  initialExistingVideos = [],
  genreOptions = [],
  neighborhoodOptions = [],
  memberOptions = [],
  existingBands = [],
  embedded = false,
  onCreated,
  onCancel,
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialGenres?: string;
  initialSimilarTo?: string;
  initialLocation?: string;
  initialNeighborhoods?: string;
  initialMembers?: string;
  initialContactEmail?: string;
  initialContactMethod?: string;
  initialWebsite?: string;
  initialInstagram?: string;
  initialBandcamp?: string;
  initialBandcampLink?: string;
  initialBio?: string;
  initialImage?: string;
  initialFeaturedLinks?: string;
  /** Every existing video row on the band (any status), fetched server-side
   * by app/submit/page.tsx — see toExistingVideos above. */
  initialExistingVideos?: {
    id: number;
    video_url: string;
    video_title: string;
    status: string;
    hidden: boolean;
  }[];
  genreOptions?: string[];
  neighborhoodOptions?: string[];
  memberOptions?: string[];
  existingBands?: { name: string; slug: string }[];
  /** Render inline inside another form (e.g. the Edit Show form's "add a band"
   * panel) rather than as a standalone page: drops the page heading and the
   * sidebar preview card, and — instead of showing its own success screen —
   * hands the freshly-created band back to the parent via onCreated so it can
   * link it and close the panel. add mode only. */
  embedded?: boolean;
  onCreated?: (band: { slug: string; name: string }) => void;
  onCancel?: () => void;
}) {
  const isCorrect = mode === "correct";

  const [form, setForm] = useState<FormState>({
    bandName: initialName,
    genres: initialGenres,
    similarTo: initialSimilarTo,
    location: initialLocation,
    neighborhoods: initialNeighborhoods,
    members: initialMembers,
    contactEmail: initialContactEmail,
    contactMethod: initialContactMethod,
    website: initialWebsite,
    instagram: initialInstagram,
    bandcamp: initialBandcamp,
    bandcampLink: initialBandcampLink,
    bio: initialBio,
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  // Correction flow: whether the user asked to remove the band's current photo.
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  // Featured "linktree" links — three fixed slots (url + label).
  const [featuredLinks, setFeaturedLinks] = useState<LinkInput[]>(() =>
    initialFeaturedLinkSlots(initialFeaturedLinks),
  );
  // Videos already on the band (correction mode), each hideable/unhideable
  // and reorderable via move up/down, plus a dynamic add-list of new YouTube
  // URLs. `videoHiddenOverrides` tracks only
  // the ones the submitter has toggled this session (id -> new hidden
  // state); everything else keeps whatever hidden state it loaded with. The
  // array's own order IS the display order sent back on submit (see
  // moveExistingVideo) — no separate "dirty" tracking needed there.
  const [existingVideos, setExistingVideos] = useState<ExistingVideo[]>(() =>
    toExistingVideos(initialExistingVideos),
  );
  const [videoHiddenOverrides, setVideoHiddenOverrides] = useState<Record<number, boolean>>({});
  const [videos, setVideos] = useState<VideoInput[]>([emptyVideo()]);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Slug of the band just submitted, so the success screen can link to its
  // profile page (set from the same bandSlug sent in the payload).
  const [submittedSlug, setSubmittedSlug] = useState("");
  // City picker: whether the free-text "Other" city box is active. Seeded true
  // when editing a band whose city isn't one of the one-tap KNOWN_CITIES.
  const [cityIsOther, setCityIsOther] = useState(
    () =>
      !!initialLocation &&
      !KNOWN_CITIES.includes(initialLocation as (typeof KNOWN_CITIES)[number]),
  );
  // Duplicate guard (add mode only): the slug of a same-named band the user has
  // explicitly confirmed is nonetheless a *different* band. Tracking the slug
  // (not a bool) auto-expires the confirmation if the name later collides with a
  // different band — no reset effect needed.
  const [overriddenSlug, setOverriddenSlug] = useState<string | null>(null);
  // Accordion open/closed state per section. Add mode starts with Basics and
  // Notes open (they're not collapsible in add mode anyway) and the two
  // enrichment sections collapsed & empty. Correct mode starts every section
  // collapsed, so fixing one field means expanding only that section.
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    () =>
      isCorrect
        ? { basics: false, musicLinks: false, bioShows: false, aboutYou: false }
        : { basics: true, musicLinks: false, bioShows: false, aboutYou: true },
  );

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Build a revocable object URL for the thumbnail preview, and revoke it
  // whenever the selected file changes or the component unmounts.
  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Drop a single field's error (used as the user edits, so the inline error
  // and the summary above the submit button clear the moment it's addressed).
  function clearError(key: keyof FormState) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const set =
    (key: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      clearError(key);
    };

  // After a failed submit, bring the first invalid field into view and focus
  // it. Fields are located by their <label for> (which exists even when the
  // input is conditionally rendered, e.g. the City "Other" box). The topmost by
  // viewport position wins, so it matches reading order regardless of the order
  // errors were collected in.
  function focusFirstError(ids: string[]) {
    requestAnimationFrame(() => {
      const located = ids
        .map((id) => ({
          id,
          label: document.querySelector<HTMLElement>(`label[for="${id}"]`),
        }))
        .filter(
          (t): t is { id: string; label: HTMLElement } => t.label !== null,
        )
        .sort(
          (a, b) =>
            a.label.getBoundingClientRect().top -
            b.label.getBoundingClientRect().top,
        );
      const first = located[0];
      if (!first) return;
      first.label.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(first.id)?.focus({ preventScroll: true });
    });
  }

  // Expand whichever accordion section(s) contain the given field ids before
  // focusing the first one — a collapsed section has nothing in the DOM to
  // scroll to or focus.
  function revealAndFocus(ids: string[]) {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const key = FIELD_SECTION[id];
        if (key) next[key] = true;
      }
      return next;
    });
    focusFirstError(ids);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    // Selecting a new file is an implicit removal of the existing photo, so
    // cancelling the new file falls back to "no photo", not the original.
    if (file) setRemoveExistingImage(true);
    if (imageError) setImageError("");
  }

  function clearImageFile() {
    // Preserve removeExistingImage (kept true once a file was ever chosen or
    // the existing photo was removed) so cancelling the new file lands on
    // "no photo" rather than restoring the original.
    setImageFile(null);
    // Reset the input's value so re-selecting the same file fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateFeaturedLink(index: number, key: keyof LinkInput, value: string) {
    setFeaturedLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    );
  }

  function updateVideo(index: number, key: keyof VideoInput, value: string) {
    setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  }

  function addVideo() {
    setVideos((prev) => [...prev, emptyVideo()]);
  }

  function removeVideo(index: number) {
    setVideos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyVideo()];
    });
  }

  /** Toggle an existing video's hidden state — reversible, unlike the old
   * hard-delete. `currentHidden` is the effective state shown in the UI
   * (initial value overridden by any earlier toggle this session). */
  function toggleVideoHidden(id: number, currentHidden: boolean) {
    setVideoHiddenOverrides((prev) => ({ ...prev, [id]: !currentHidden }));
  }

  /** Swap an existing video with its neighbor — same move-buttons pattern as
   * BandLayoutEditor's section reorder, adapted for a flat list. */
  function moveExistingVideo(index: number, delta: number) {
    setExistingVideos((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Drag-and-drop reorder for existing videos — a pointer-friendly companion
  // to the move buttons above, not a replacement: those stay for keyboard and
  // screen-reader use, and for touch (native HTML5 drag doesn't fire on touch
  // devices at all, so the buttons are the only way to reorder there).
  const draggedVideoIndex = useRef<number | null>(null);
  const [dragOverVideoIndex, setDragOverVideoIndex] = useState<number | null>(null);

  function handleVideoDragStart(index: number) {
    draggedVideoIndex.current = index;
  }
  function handleVideoDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragOverVideoIndex !== index) setDragOverVideoIndex(index);
  }
  function handleVideoDrop(index: number) {
    const from = draggedVideoIndex.current;
    draggedVideoIndex.current = null;
    setDragOverVideoIndex(null);
    if (from === null || from === index) return;
    setExistingVideos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  }
  function handleVideoDragEnd() {
    draggedVideoIndex.current = null;
    setDragOverVideoIndex(null);
  }

  // Duplicate detection (add mode only): flag when the typed name matches a band
  // already in the directory, by normalized name or resulting slug. Best-effort
  // — the user can override it (see the warning below the Band name field).
  const dupMatch = useMemo(() => {
    if (isCorrect) return null;
    const typed = normalizeName(form.bandName);
    if (!typed) return null;
    const typedSlug = slugify(form.bandName);
    return (
      existingBands.find(
        (b) => normalizeName(b.name) === typed || b.slug === typedSlug,
      ) ?? null
    );
  }, [isCorrect, form.bandName, existingBands]);

  // The override applies only to the currently-matched band.
  const duplicateConfirmed = !!dupMatch && overriddenSlug === dupMatch.slug;

  // Show the band's current photo only in correction mode, while it hasn't
  // been removed and no new file has been chosen (a new file takes precedence).
  const showExistingImage =
    isCorrect && !!initialImage && !removeExistingImage && !imageFile;
  const heading = isCorrect ? "Edit this band" : "Add your band";
  const subhead = isCorrect
    ? "Spot something wrong or out of date? Update it below."
    : "Add your band to the directory!";

  function validate(): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.bandName.trim()) e.bandName = "Required";
    // TEMP: all fields except Band name made optional for bulk band entry.
    // Revert this function to restore the full validation below.
    return e;
    if (!form.genres.trim()) e.genres = "Required";
    if (!form.location.trim()) e.location = "Required";
    // Contact method is optional, but choosing one makes that field required.
    if (form.contactMethod === "email" && !form.contactEmail.trim())
      e.contactEmail = "Required — you chose email as your contact method";
    if (form.contactMethod === "instagram" && !form.instagram.trim())
      e.instagram = "Required — you chose Instagram as your contact method";
    if (form.contactMethod === "website" && !form.website.trim())
      e.website = "Required — you chose website as your contact method";
    // Validate the email format whenever one is given.
    if (form.contactEmail.trim() && !EMAIL_RE.test(form.contactEmail.trim()))
      e.contactEmail = "Enter a valid email address";
    return e;
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);

    // A photo is normally required when adding a band, but optional for
    // corrections. TEMP: photo made optional everywhere for bulk band entry
    // (restore the `if (!isCorrect) imgErr = "Required";` line to revert).
    let imgErr = "";
    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
      imgErr = "Image too large — please use a file under 4MB";
    }
    setImageError(imgErr);

    if (Object.keys(found).length > 0 || imgErr) {
      const ids = Object.keys(found);
      if (imgErr) ids.push("bandPhoto");
      revealAndFocus(ids);
      return;
    }

    // Block a likely duplicate unless the user explicitly confirmed it's a
    // distinct band. Scrolls to the Band name field, where the notice sits.
    if (dupMatch && !duplicateConfirmed) {
      revealAndFocus(["bandName"]);
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const bandSlug =
        isCorrect && initialSlug ? initialSlug : slugify(form.bandName);

      const payload = new FormData();
      for (const [key, value] of Object.entries(form)) {
        payload.set(key, value);
      }
      payload.set("existingSlug", isCorrect ? initialSlug : "");
      payload.set("mode", mode);
      payload.set("bandSlug", bandSlug);
      // Signals the server to blank the photo when no new one is uploaded.
      payload.set("removeImage", removeExistingImage ? "true" : "false");

      // Only send the photo if one was selected — the server leaves the
      // existing photo alone when this field is absent.
      if (imageFile) {
        payload.set("photo", imageFile);
      }

      // Featured links — keep only rows with a URL, in slot order. Always send
      // the key (even when empty) so clearing every link on a correction wipes
      // the stored value rather than leaving the old one.
      const filledLinks = featuredLinks
        .filter((l) => l.url.trim())
        .map((l) => ({ url: l.url.trim(), label: l.label.trim() }));
      payload.set("featuredLinks", JSON.stringify(filledLinks));

      // New videos — keep only rows with a URL. Existing videos the user
      // hid/unhid this session are sent separately by id.
      const filledVideos = videos
        .filter((v) => v.url.trim())
        .map((v) => ({ url: v.url.trim(), label: v.label.trim() }));
      payload.set("newVideos", JSON.stringify(filledVideos));
      payload.set(
        "videoHiddenChanges",
        JSON.stringify(Object.entries(videoHiddenOverrides).map(([id, hidden]) => ({
          id: Number(id),
          hidden,
        }))),
      );
      // The array's current order — whether or not it was actually moved —
      // becomes the band's pinned display order (lib/videos.ts setVideoOrder).
      payload.set("existingVideoOrder", JSON.stringify(existingVideos.map((v) => v.id)));

      const res = await fetch("/api/bands/submit", { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Submission failed");
      }
      const savedSlug = typeof data.slug === "string" ? data.slug : bandSlug;
      setSubmittedSlug(savedSlug);
      // Embedded: hand the band back to the parent form (which links it and
      // closes the panel) rather than swapping in the standalone success screen.
      if (embedded && onCreated) {
        onCreated({ slug: savedSlug, name: form.bandName.trim() });
        return;
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  }

  if (status === "success") {
    const bandHref = submittedSlug ? `/bands/${submittedSlug}` : "/";
    return (
      <div className="rounded-lg border border-ink/15 bg-paper p-8 text-center">
        <h2 className="text-xl font-medium text-ink">
          {isCorrect ? "Thanks for the updates!" : "Thanks!"}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/75">
          {isCorrect
            ? "If the changes don't appear immediately, give it a minute or so."
            : "Your band's been added — if it doesn't appear immediately, give it a minute or so."}
        </p>
        <Link
          href={bandHref}
          className="mt-6 inline-block rounded-md border border-ink/40 px-4 py-2 text-sm text-ink transition hover:bg-ink/10"
        >
          {submittedSlug ? `View ${form.bandName || "band"} →` : "← Back to directory"}
        </Link>
      </div>
    );
  }

  const submitting = status === "submitting";
  // Count of outstanding validation problems, for the summary above the submit
  // button. Clears live as fields are fixed (see clearError).
  const invalidCount = Object.keys(errors).length + (imageError ? 1 : 0);

  // Parsed list fields, reused by the TagInputs, status chips, and the live
  // preview card.
  const genresList = form.genres
    ? form.genres.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const similarToList = form.similarTo
    ? form.similarTo.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const neighborhoodsList = form.neighborhoods
    ? form.neighborhoods.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const membersList = form.members
    ? form.members.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Status-chip inputs for the two enrichment sections.
  const filledFeaturedLinksList = featuredLinks.filter((l) => l.url.trim());
  const filledNewVideosList = videos.filter((v) => v.url.trim());
  const previewPhotoUrl = previewUrl ?? (showExistingImage ? initialImage : null);
  const hasPhoto = !!previewPhotoUrl;

  const musicLinksCount =
    (form.website.trim() ? 1 : 0) +
    (form.instagram.trim() ? 1 : 0) +
    (form.bandcampLink.trim() ? 1 : 0) +
    (form.bandcamp.trim() ? 1 : 0) +
    filledFeaturedLinksList.length +
    existingVideos.length +
    filledNewVideosList.length;
  const musicLinksChip = musicLinksCount === 0 ? "Empty" : `${musicLinksCount} added`;

  const bioShowsCount = (form.bio.trim() ? 1 : 0) + (hasPhoto ? 1 : 0);
  const bioShowsChip =
    bioShowsCount === 0
      ? "Empty"
      : bioShowsCount === 1 && hasPhoto
        ? "Photo added"
        : bioShowsCount === 1 && form.bio.trim()
          ? "Bio added"
          : `${bioShowsCount} added`;

  const basicsChip = `${genresList.length} genre${
    genresList.length === 1 ? "" : "s"
  } · ${form.location || "No city"}`;

  const aboutYouChip = form.notes.trim() ? "Notes added" : "Empty";

  // Embedded inside another form (the Edit Show form), a nested <form> would be
  // invalid HTML and its submit event would bubble up and fire the outer form's
  // handler too — so embedded renders a plain <div> and submits via the button's
  // onClick instead.
  const FormWrapper: React.ElementType = embedded ? "div" : "form";
  const formWrapperProps = embedded
    ? { className: "space-y-5" }
    : { onSubmit: handleSubmit, noValidate: true, className: "space-y-5" };

  return (
    <div
      className={
        embedded
          ? ""
          : "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,42rem)_220px] lg:items-start"
      }
    >
      <div className="rounded-lg border border-ink/15 bg-paper p-5 sm:p-7">
        {embedded ? (
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-ink">Add a band</h2>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 text-xs text-ink/60 underline underline-offset-2 transition hover:text-ink"
              >
                Never mind
              </button>
            )}
          </div>
        ) : (
          <div className="mb-6">
            <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              {heading}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70">
              {subhead}
            </p>
          </div>
        )}

        <FormWrapper {...formWrapperProps}>
          <AccordionSection
            id="basics"
            title="The Basics"
            description="Name, genre, city, and who's in the band."
            statusChip={isCorrect ? basicsChip : undefined}
            open={openSections.basics}
            onToggle={() => toggleSection("basics")}
            collapsible={isCorrect}
          >
            <Field
              label="Band name"
              htmlFor="bandName"
              required
              error={errors.bandName}
            >
              <input
                id="bandName"
                type="text"
                value={form.bandName}
                onChange={set("bandName")}
                className={inputClass}
              />
              {dupMatch && (
                <div
                  role="alert"
                  className="mt-2 rounded-md border border-[#B45309]/40 bg-[#B45309]/10 px-3.5 py-3 text-sm text-[#7c4406]"
                >
                  <p className="font-semibold">
                    “{dupMatch.name}” is already in the directory.
                  </p>
                  <p className="mt-1 text-[#7c4406]/90">
                    If that&apos;s your band,{" "}
                    <Link
                      href={`/bands/${dupMatch.slug}`}
                      target="_blank"
                      className="font-medium underline underline-offset-2 hover:no-underline"
                    >
                      view its profile
                    </Link>{" "}
                    and use “Edit this band” there instead of adding it again.
                  </p>
                  <label className="mt-2.5 flex cursor-pointer items-start gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={duplicateConfirmed}
                      onChange={(e) =>
                        setOverriddenSlug(e.target.checked ? dupMatch.slug : null)
                      }
                      className="mt-0.5 accent-[#7c4406]"
                    />
                    <span>
                      This is a different band that happens to share the name —
                      add it anyway
                    </span>
                  </label>
                </div>
              )}
            </Field>

            <Field
              label="Genre(s)"
              htmlFor="genres"
              required
              error={errors.genres}
              hint="Pick from existing genres or type your own — be as specific or weird as you want."
            >
              <TagInput
                id="genres"
                options={genreOptions}
                placeholder="e.g. Baroque Yachtgaze, Sewer Punk"
                value={genresList}
                onChange={(next) => {
                  setForm((f) => ({ ...f, genres: next.join(", ") }));
                  clearError("genres");
                }}
                hasError={!!errors.genres}
              />
            </Field>

            <Field
              label="For fans of"
              htmlFor="similarTo"
              hint="Artists you sound like — the “recommended if you like…” a new listener would get. Pick from the directory or type any band."
            >
              <TagInput
                id="similarTo"
                options={existingBands.map((b) => b.name)}
                placeholder="e.g. Low, Hüsker Dü, Bon Iver"
                value={similarToList}
                onChange={(next) =>
                  setForm((f) => ({ ...f, similarTo: next.join(", ") }))
                }
              />
            </Field>

            <Field
              label="City"
              htmlFor="location"
              required
              error={errors.location}
            >
              <div className="flex flex-wrap gap-2">
                {KNOWN_CITIES.map((c) => {
                  const active = !cityIsOther && form.location === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCityIsOther(false);
                        setForm((f) => ({ ...f, location: c }));
                        clearError("location");
                      }}
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${
                        active
                          ? "border-ink bg-ink text-paper"
                          : "border-ink/25 text-ink/70 hover:border-ink/60"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setCityIsOther(true);
                    // Clear a previously-picked known city so the box starts empty.
                    setForm((f) => ({
                      ...f,
                      location: KNOWN_CITIES.includes(
                        f.location as (typeof KNOWN_CITIES)[number],
                      )
                        ? ""
                        : f.location,
                    }));
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    cityIsOther
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/25 text-ink/70 hover:border-ink/60"
                  }`}
                >
                  Other
                </button>
              </div>
              {cityIsOther && (
                <input
                  id="location"
                  type="text"
                  value={form.location}
                  onChange={set("location")}
                  placeholder="e.g. Duluth, Hopkins"
                  className={`${inputClass} mt-2`}
                />
              )}
            </Field>

            <Field
              label="Neighborhood(s)"
              htmlFor="neighborhoods"
              hint="Optional — pick from the list or add your own, so people can find bands by their part of town."
            >
              <TagInput
                id="neighborhoods"
                options={neighborhoodOptions}
                placeholder="e.g. Powderhorn, Seward"
                value={neighborhoodsList}
                onChange={(next) =>
                  setForm((f) => ({ ...f, neighborhoods: next.join(", ") }))
                }
              />
            </Field>

            <Field
              label="Band members"
              htmlFor="members"
              hint="Optional — add each member's name. Start typing to see people already in the directory, so fans can find every project someone's in."
            >
              <TagInput
                id="members"
                options={memberOptions}
                placeholder="e.g. Jane Doe, John Smith"
                value={membersList}
                onChange={(next) =>
                  setForm((f) => ({ ...f, members: next.join(", ") }))
                }
              />
            </Field>
          </AccordionSection>

          <AccordionSection
            id="musicLinks"
            title="Music, Links & Video"
            description="Contact info, Bandcamp player, featured links, and videos — all optional."
            statusChip={musicLinksChip}
            open={openSections.musicLinks}
            onToggle={() => toggleSection("musicLinks")}
          >
            <SubGroup label="Socials">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Website"
                  htmlFor="website"
                  error={errors.website}
                >
                  <input
                    id="website"
                    type="url"
                    value={form.website}
                    onChange={set("website")}
                    placeholder="https://"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Instagram handle"
                  htmlFor="instagram"
                  error={errors.instagram}
                  hint="Just the handle, no @"
                >
                  <input
                    id="instagram"
                    type="text"
                    value={form.instagram}
                    onChange={set("instagram")}
                    placeholder="yourband"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Bandcamp link"
                  htmlFor="bandcampLink"
                  error={errors.bandcampLink}
                  hint="Your Bandcamp page, shown as a link on your profile."
                >
                  <input
                    id="bandcampLink"
                    type="url"
                    value={form.bandcampLink}
                    onChange={set("bandcampLink")}
                    placeholder="https://yourband.bandcamp.com"
                    className={inputClass}
                  />
                </Field>
              </div>
            </SubGroup>

            <SubGroup
              label="Bandcamp player"
              description="Right now this is the only way to make your music playable directly on Twin Scene (fuck Spotify)."
            >
              <Field
                label="Bandcamp"
                htmlFor="bandcamp"
                hint="Paste your Bandcamp link, or for a richer player, paste the embed code from Bandcamp's Share/Embed button."
              >
                <input
                  id="bandcamp"
                  type="text"
                  value={form.bandcamp}
                  onChange={set("bandcamp")}
                  placeholder="https://…  or  <iframe …>"
                  className={inputClass}
                />
              </Field>
            </SubGroup>

            <SubGroup
              label="Featured links"
              description="Up to three things you most want people to see — show tickets, a new release, a fundraiser, whatever. We'll try to pull in a preview image automatically."
            >
              <div className="space-y-4">
                {featuredLinks.map((link, i) => (
                  <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <div>
                      <label
                        htmlFor={`featured-${i}-url`}
                        className="mb-1 block text-xs text-ink/70"
                      >
                        Link {i + 1}
                      </label>
                      <input
                        id={`featured-${i}-url`}
                        type="url"
                        value={link.url}
                        onChange={(e) =>
                          updateFeaturedLink(i, "url", e.target.value)
                        }
                        placeholder="https://"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`featured-${i}-label`}
                        className="mb-1 block text-xs text-ink/70"
                      >
                        What is it?
                      </label>
                      <input
                        id={`featured-${i}-label`}
                        type="text"
                        value={link.label}
                        onChange={(e) =>
                          updateFeaturedLink(i, "label", e.target.value)
                        }
                        placeholder="e.g. Tickets to our EP release show"
                        className={inputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SubGroup>

            <SubGroup
              label="Videos"
              description="YouTube videos of the band — a live set, a music video, whatever. Paste a link per row. Use the arrows to set the order they show up in on your profile. Hiding an existing video takes it off your profile without deleting it, so you can bring it back later."
            >
              {existingVideos.length > 0 && (
                <div className="space-y-2">
                  {existingVideos.map((video, i) => {
                    const hidden = videoHiddenOverrides[video.id] ?? video.hidden;
                    return (
                      <div
                        key={video.id}
                        onDragOver={(e) => handleVideoDragOver(e, i)}
                        onDrop={() => handleVideoDrop(i)}
                        className={`flex items-center justify-between gap-3 rounded-md bg-ink/5 px-3.5 py-2.5 transition ${
                          hidden ? "opacity-50" : ""
                        } ${dragOverVideoIndex === i ? "ring-2 ring-accent/60" : ""}`}
                      >
                        <div
                          draggable
                          onDragStart={() => handleVideoDragStart(i)}
                          onDragEnd={handleVideoDragEnd}
                          aria-hidden="true"
                          title="Drag to reorder"
                          className="hidden shrink-0 cursor-grab select-none text-ink/30 hover:text-ink/60 active:cursor-grabbing sm:block"
                        >
                          ⠿
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm text-ink">{video.title}</p>
                            <span className="shrink-0 rounded-full border border-ink/15 bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink/45">
                              {video.source === "manual" ? "Added by the band" : "Filmed by UnderCurrentMPLS"}
                            </span>
                            {hidden && (
                              <span className="shrink-0 rounded-full border border-ink/15 bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink/45">
                                Hidden
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-ink/50">{video.url}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => moveExistingVideo(i, -1)}
                            aria-label={`Move ${video.title} up`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-ink/20 text-xs text-ink/70 transition hover:bg-ink/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={i === existingVideos.length - 1}
                            onClick={() => moveExistingVideo(i, 1)}
                            aria-label={`Move ${video.title} down`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-ink/20 text-xs text-ink/70 transition hover:bg-ink/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleVideoHidden(video.id, hidden)}
                            className={`rounded-md border px-2.5 py-1 text-xs transition ${
                              hidden
                                ? "border-ink/20 text-ink/70 hover:border-accent/50 hover:text-ink"
                                : "border-ink/20 text-ink/70 hover:border-danger/50 hover:text-danger"
                            }`}
                          >
                            {hidden ? "Unhide" : "Hide"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3">
                {videos.map((video, i) => (
                  <div key={i} className="relative rounded-md bg-ink/5 p-4 pr-10">
                    <button
                      type="button"
                      aria-label="Remove this video"
                      onClick={() => removeVideo(i)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink/20 text-sm leading-none text-ink/70 transition hover:text-ink"
                    >
                      ×
                    </button>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`video-${i}-url`}
                          className="mb-1 block text-xs text-ink/70"
                        >
                          YouTube link
                        </label>
                        <input
                          id={`video-${i}-url`}
                          type="url"
                          value={video.url}
                          onChange={(e) => updateVideo(i, "url", e.target.value)}
                          placeholder="https://youtube.com/watch?v=…"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`video-${i}-label`}
                          className="mb-1 block text-xs text-ink/70"
                        >
                          Caption (optional)
                        </label>
                        <input
                          id={`video-${i}-label`}
                          type="text"
                          value={video.label}
                          onChange={(e) => updateVideo(i, "label", e.target.value)}
                          placeholder="e.g. Live at the Turf Club"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addVideo}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-ink/30 px-3 py-1.5 text-sm text-ink/80 transition hover:bg-ink/10 hover:text-ink"
              >
                + Add another video
              </button>
            </SubGroup>
          </AccordionSection>

          <AccordionSection
            id="bioShows"
            title="Bio & Photo"
            description="Your bio and a photo for the top of your profile."
            statusChip={bioShowsChip}
            open={openSections.bioShows}
            onToggle={() => toggleSection("bioShows")}
          >
            <SubGroup label="Bio & photo">
              <Field label="Short bio" htmlFor="bio">
                <textarea
                  id="bio"
                  value={form.bio}
                  onChange={set("bio")}
                  maxLength={BIO_MAX}
                  rows={4}
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-right text-xs text-ink/45">
                  {form.bio.length}/{BIO_MAX}
                </p>
              </Field>

              <Field
                label={
                  isCorrect
                    ? "Band photo (optional — only needed if you want to update the current photo)"
                    : "Band photo"
                }
                htmlFor="bandPhoto"
                required={!isCorrect}
                error={imageError}
                hint="This will appear on your directory card. JPG or PNG, at least 800px wide recommended."
              >
                <input
                  id="bandPhoto"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  required={!isCorrect}
                  onChange={handleFileChange}
                  className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-ink/15 file:px-3 file:py-1 file:text-sm file:text-ink`}
                />
                {previewUrl && (
                  <div className="relative mt-3 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Selected band photo preview"
                      className="h-60 w-60 rounded-md border border-ink/20 object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove selected photo"
                      onClick={clearImageFile}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-ink/20 bg-paper/90 text-sm leading-none text-ink/80 transition hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                )}
                {showExistingImage && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-ink/60">Current photo:</p>
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={initialImage}
                        alt="Current band photo"
                        className="h-60 w-60 rounded-md border border-ink/20 object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Remove current photo"
                        onClick={() => setRemoveExistingImage(true)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-ink/20 bg-paper/90 text-sm leading-none text-ink/80 transition hover:text-ink"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </Field>
            </SubGroup>

            <SubGroup
              label="Upcoming shows"
              description="Your shows mostly appear on their own — no need to enter them here."
            >
              <div className="rounded-md border border-ink/10 bg-ink/[0.03] p-4 text-[13px] leading-relaxed text-ink/60">
                <p>
                  Twin Scene keeps a master list of upcoming shows across local
                  venues. Whenever a show&rsquo;s lineup includes your band, it
                  links to your profile automatically — so most of your shows
                  land here with nothing to do on your end.
                </p>
                <p className="mt-2">
                  {isCorrect ? (
                    <>Don&rsquo;t see one of your upcoming shows? Add it and pick
                    your band from the list — it&rsquo;ll show up on your
                    profile right away.</>
                  ) : (
                    <>Once your band is live, your shows will start linking
                    here automatically. Anything we miss, you can add yourself
                    from the Shows page.</>
                  )}
                </p>

                {isCorrect && (
                  <Link
                    href={`/shows/submit${
                      initialSlug ? `?band=${encodeURIComponent(initialSlug)}` : ""
                    }`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-ink/30 px-3 py-1.5 text-sm text-ink/80 transition hover:bg-ink/10 hover:text-ink"
                  >
                    + Add a show in the Shows page
                  </Link>
                )}
              </div>
            </SubGroup>
          </AccordionSection>

          <AccordionSection
            id="aboutYou"
            title="Notes"
            description="Anything else we should know, or what you're correcting."
            statusChip={isCorrect ? aboutYouChip : undefined}
            open={openSections.aboutYou}
            onToggle={() => toggleSection("aboutYou")}
            collapsible={isCorrect}
          >
            <Field label="Additional notes" htmlFor="notes">
              <textarea
                id="notes"
                value={form.notes}
                onChange={set("notes")}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </AccordionSection>

          {status === "error" && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {errorMsg}
            </p>
          )}

          {invalidCount > 0 && (
            <p
              role="alert"
              className="rounded-md border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
            >
              {invalidCount === 1
                ? "Please fix the highlighted field above before submitting."
                : `Please fix the ${invalidCount} highlighted fields above before submitting.`}
            </p>
          )}

          {embedded && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add band & link to show"}
            </button>
          )}
          {!embedded && (
            <div className="sticky bottom-0 z-20 -mx-5 border-t border-ink/15 bg-paper/95 px-5 py-4 backdrop-blur sm:-mx-7 sm:px-7">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Submitting…"
                  : isCorrect
                    ? "Update band"
                    : "Submit your band"}
              </button>
            </div>
          )}
        </FormWrapper>
      </div>

      {!embedded && (
      <aside className="lg:sticky lg:top-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#E8E0D0]/40">
          How this looks in the directory
        </p>
        <div className="max-w-[220px]">
          <LivePreviewCard
            name={form.bandName}
            genres={genresList}
            neighborhoods={neighborhoodsList}
            city={form.location}
            photoUrl={previewPhotoUrl}
          />
        </div>
      </aside>
      )}
    </div>
  );
}
