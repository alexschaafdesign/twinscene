"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postToAppsScript } from "@/lib/postToAppsScript";
import { resizeImageFile } from "@/lib/resizeImage";

// Shared input styling, kept in sync with SubmitForm.tsx.
const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

// Mirrors app/api/shows/submit/route.ts's MAX_FLYER_BYTES/ALLOWED_TYPES —
// checked here too so an oversized flyer never has to make a round trip
// just to be rejected.
const MAX_FLYER_BYTES = 4 * 1024 * 1024;
const ALLOWED_FLYER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type BandOption = { slug: string; name: string };

/** Prefix a bare URL with https:// so the format check accepts "example.com". */
function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(ensureUrl(value));
    return true;
  } catch {
    return false;
  }
}

/** Lowercase/hyphenate a band name. Kept in sync with slugify in fetchBands. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-[#E8E0D0]/85">
        {label}
        {required && <span className="text-[#E8E0D0]/50"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-[#E8E0D0]/45">{hint}</p>}
      {error && <p className="mt-1 text-xs text-[#E5A0A0]">{error}</p>}
    </div>
  );
}

/**
 * Single-select-but-add-many band search. Type to filter existing bands by
 * name; selecting one calls onAdd (the parent keeps the selected list and
 * renders the chips). When `onQuickAdd` is provided and the typed name matches
 * no existing directory band, the dropdown offers an "Add to directory" entry
 * that quick-adds a name-only band and links it (used in edit mode, where the
 * full add-a-band form isn't available). Mirrors the keyboard/mouse behaviour
 * of the genre tag-input on the band form.
 */
function BandSearchSelect({
  bands,
  selected,
  onAdd,
  onQuickAdd,
}: {
  bands: BandOption[];
  selected: BandOption[];
  onAdd: (band: BandOption) => void;
  onQuickAdd?: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSlugs = new Set(selected.map((b) => b.slug));
  const q = query.trim();
  const qLower = q.toLowerCase();
  const matches = bands
    .filter(
      (b) =>
        !selectedSlugs.has(b.slug) &&
        (qLower === "" || b.name.toLowerCase().includes(qLower)),
    )
    .slice(0, 8);

  // Offer a quick-add when a name is typed that's neither an exact directory
  // match nor already selected.
  const exactExists =
    qLower !== "" &&
    (bands.some((b) => b.name.toLowerCase() === qLower) ||
      selected.some((b) => b.name.toLowerCase() === qLower));
  const showAdd = !!onQuickAdd && qLower !== "" && !exactExists;

  type Item =
    | { type: "existing"; band: BandOption }
    | { type: "add"; name: string };
  const items: Item[] = [
    ...matches.map((b) => ({ type: "existing" as const, band: b })),
    ...(showAdd ? [{ type: "add" as const, name: q }] : []),
  ];
  const activeIndex = highlight < items.length ? highlight : 0;

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

  function choose(band: BandOption) {
    onAdd(band);
    setQuery("");
    setHighlight(0);
    setAddError("");
    inputRef.current?.focus();
  }

  async function quickAdd(name: string) {
    if (!onQuickAdd || adding) return;
    setAdding(true);
    setAddError("");
    try {
      await onQuickAdd(name);
      // The parent links the new band; clear the box for the next one.
      setQuery("");
      setHighlight(0);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add band");
    } finally {
      setAdding(false);
    }
  }

  function activate(item: Item) {
    if (item.type === "existing") choose(item.band);
    else quickAdd(item.name);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
      // Never submit the form from the search box.
      e.preventDefault();
      if (open && items.length > 0) activate(items[activeIndex]);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search bands by name…"
        className={inputClass}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] py-1 shadow-lg">
          {items.map((item, i) => (
            <li
              key={item.type === "add" ? `__add__${item.name}` : item.band.slug}
            >
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // Select before the input blurs and closes the dropdown.
                  e.preventDefault();
                  activate(item);
                }}
                className={`block w-full px-3 py-2 text-left text-sm text-[#E8E0D0] ${
                  i === activeIndex ? "bg-[#E8E0D0]/10" : ""
                } ${item.type === "add" ? "italic text-[#E8E0D0]/80" : ""}`}
              >
                {item.type === "add"
                  ? adding
                    ? `Adding “${item.name}”…`
                    : `+ Add “${item.name}” to directory`
                  : item.band.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {addError && <p className="mt-1 text-xs text-[#E5A0A0]">{addError}</p>}
    </div>
  );
}

export type ShowInitial = {
  id: string;
  date: string;
  venue: string;
  title: string;
  lineup: string;
  notes: string;
  link: string;
  musicTime: string; // 24-hour "HH:MM" for <input type="time">, "" when unset
  doorsTime: string;
  genres: string; // comma-separated for the text input, "" when none
  ageRestriction: string; // "21+" / "All Ages", "" when unknown
  bands: BandOption[];
};

export default function ShowSubmitForm({
  bands,
  mode = "add",
  initial,
}: {
  bands: BandOption[];
  mode?: "add" | "edit";
  initial?: ShowInitial;
}) {
  const isEdit = mode === "edit";

  const [date, setDate] = useState(initial?.date ?? "");
  const [venue, setVenue] = useState(initial?.venue ?? "");
  // Title/lineup are edited directly (edit mode only); in add mode the Apps
  // Script derives them from the selected bands.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [lineup, setLineup] = useState(initial?.lineup ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  // Structured show/doors times (edit mode only). "HH:MM" 24-hour or "".
  const [musicTime, setMusicTime] = useState(initial?.musicTime ?? "");
  const [doorsTime, setDoorsTime] = useState(initial?.doorsTime ?? "");
  const [genres, setGenres] = useState(initial?.genres ?? "");
  const [ageRestriction, setAgeRestriction] = useState(initial?.ageRestriction ?? "");

  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);
  const flyerInputRef = useRef<HTMLInputElement>(null);

  const [selectedBands, setSelectedBands] = useState<BandOption[]>(
    initial?.bands ?? [],
  );
  const [showNewBand, setShowNewBand] = useState(false);
  const [newBandName, setNewBandName] = useState("");
  const [newBandGenres, setNewBandGenres] = useState("");
  const [newBandLocation, setNewBandLocation] = useState("");
  const [newBandContactEmail, setNewBandContactEmail] = useState("");
  const [newBandInstagram, setNewBandInstagram] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function addBand(band: BandOption) {
    setSelectedBands((prev) =>
      prev.some((b) => b.slug === band.slug) ? prev : [...prev, band],
    );
  }

  function removeBand(slug: string) {
    setSelectedBands((prev) => prev.filter((b) => b.slug !== slug));
  }

  async function handleFlyerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;

    if (!ALLOWED_FLYER_TYPES.has(file.type)) {
      setErrors((prev) => ({ ...prev, flyer: "Unsupported image type — use JPEG, PNG, WebP, or GIF" }));
      input.value = "";
      return;
    }

    const resized = file.size > MAX_FLYER_BYTES ? await resizeImageFile(file) : file;
    if (resized.size > MAX_FLYER_BYTES) {
      const mb = (resized.size / (1024 * 1024)).toFixed(1);
      setErrors((prev) => ({ ...prev, flyer: `That image is still ${mb}MB after downsizing — try a smaller file` }));
      input.value = "";
      return;
    }

    setErrors((prev) => {
      if (!("flyer" in prev)) return prev;
      const rest = { ...prev };
      delete rest.flyer;
      return rest;
    });
    setFlyerFile(resized);
    setFlyerPreview(URL.createObjectURL(resized));
  }

  function removeFlyer() {
    setFlyerFile(null);
    setFlyerPreview(null);
    if (flyerInputRef.current) flyerInputRef.current.value = "";
  }

  /**
   * Name-only quick-add for a band that isn't in the directory yet, mirroring
   * the show-import "Add to directory" flow: publishes the band immediately
   * (the Apps Script honours quickAdd to skip the notification email), then
   * links it to this show by slug. Used in edit mode, where the full
   * add-a-band form isn't offered. Throws so the search box can surface errors.
   */
  async function quickAddBand(name: string): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
    if (!url) throw new Error("Submission endpoint isn't configured.");
    const trimmed = name.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    const payload = new URLSearchParams({
      bandName: trimmed,
      submitterName: "",
      submitterEmail: "",
      genres: "",
      location: "",
      neighborhoods: "",
      members: "",
      contactEmail: "",
      contactMethod: "",
      website: "",
      instagram: "",
      bandcamp: "",
      bio: "",
      notes: "",
      existingSlug: "",
      mode: "add",
      bandSlug: slug,
      removeImage: "false",
      featuredLinks: "[]",
      quickAdd: "true",
    });
    const data = await postToAppsScript(url, payload);
    if (!data.success) throw new Error(data.error || "Couldn't add band");
    addBand({ slug, name: trimmed });
  }

  function cancelNewBand() {
    setShowNewBand(false);
    setNewBandName("");
    setNewBandGenres("");
    setNewBandLocation("");
    setNewBandContactEmail("");
    setNewBandInstagram("");
  }

  function resetForm() {
    setDate("");
    setVenue("");
    setNotes("");
    setLink("");
    setSelectedBands([]);
    removeFlyer();
    cancelNewBand();
    setErrors({});
    setErrorMsg("");
    setStatus("idle");
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!date.trim()) e.date = "Required";
    if (!venue.trim()) e.venue = "Required";
    if (link.trim() && !isValidUrl(link.trim())) e.link = "Enter a valid URL";

    if (isEdit) {
      // The listing renders the title, and bands may be free-text (e.g.
      // scraped shows), so require a title rather than a directory band.
      if (!title.trim()) e.title = "Required";
    } else {
      const hasNewBand = showNewBand && !!newBandName.trim();
      if (selectedBands.length === 0 && !hasNewBand) {
        e.bands = "Add at least one band, or add a new one below.";
      }
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      if (isEdit) {
        const body = {
          id: initial?.id ?? "",
          date: date.trim(),
          venue: venue.trim(),
          title: title.trim(),
          lineup: lineup.trim(),
          notes: notes.trim(),
          link: link.trim(),
          musicTime,
          doorsTime,
          genres: genres.trim(),
          ageRestriction: ageRestriction.trim(),
          linkedBands: selectedBands.map((b) => ({ name: b.name, slug: b.slug })),
        };
        const res = await fetch("/api/shows/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Submission failed");
        }
      } else {
        const payload = new FormData();
        payload.set("date", date.trim());
        payload.set("venue", venue.trim());
        payload.set("notes", notes.trim());
        payload.set("link", link.trim());
        payload.set(
          "linkedBands",
          JSON.stringify(selectedBands.map((b) => ({ name: b.name, slug: b.slug }))),
        );
        if (showNewBand && newBandName.trim()) {
          payload.set("newBandName", newBandName.trim());
        }
        if (flyerFile) payload.set("flyer", flyerFile);

        const res = await fetch("/api/shows/submit", { method: "POST", body: payload });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          const message =
            data?.error ||
            (res.status === 413
              ? "That flyer is too large — try a smaller file"
              : "Submission failed. Please try again.");
          throw new Error(message);
        }
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
    return (
      <div className="rounded-lg border border-[#E8E0D0]/20 p-8 text-center">
        <h2 className="text-xl font-medium">
          {isEdit ? "Show updated!" : "Show added!"}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#E8E0D0]/75">
          {isEdit
            ? "Your changes will appear on the shows page shortly."
            : "It'll appear on the shows page shortly."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/shows"
            className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
          >
            ← Upcoming Shows
          </Link>
          {!isEdit && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90"
            >
              Add another show
            </button>
          )}
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          {isEdit ? "Edit Show" : "Add a Show"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">
          {isEdit
            ? "Update the details for this show. Changes go live after a quick review."
            : "List an upcoming show for a band in the directory. We review submissions before they appear on the shows page."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date" htmlFor="date" required error={errors.date}>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </Field>

          <Field label="Venue" htmlFor="venue" required error={errors.venue}>
            <input
              id="venue"
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. 7th St Entry"
              className={inputClass}
            />
          </Field>
        </div>

        {isEdit && (
          <>
            <Field
              label="Title"
              htmlFor="title"
              required
              error={errors.title}
              hint="The show's headline as it appears in the list."
            >
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Lineup"
              htmlFor="lineup"
              hint="Full lineup, comma-separated. Leave blank if it matches the title."
            >
              <input
                id="lineup"
                type="text"
                value={lineup}
                onChange={(e) => setLineup(e.target.value)}
                placeholder="e.g. shugE, Average Joey, Ditch Pigeon"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Show time"
                htmlFor="musicTime"
                hint="When the music starts. Leave blank if unknown."
              >
                <input
                  id="musicTime"
                  type="time"
                  value={musicTime}
                  onChange={(e) => setMusicTime(e.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </Field>

              <Field label="Doors" htmlFor="doorsTime" hint="Optional.">
                <input
                  id="doorsTime"
                  type="time"
                  value={doorsTime}
                  onChange={(e) => setDoorsTime(e.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Genre(s)"
                htmlFor="genres"
                hint="Comma-separated. Suggested from listings; edit freely."
              >
                <input
                  id="genres"
                  type="text"
                  value={genres}
                  onChange={(e) => setGenres(e.target.value)}
                  placeholder="e.g. Indie Rock, Post-Punk"
                  className={inputClass}
                />
              </Field>

              <Field label="Age restriction" htmlFor="ageRestriction" hint="e.g. 21+, All Ages.">
                <input
                  id="ageRestriction"
                  type="text"
                  value={ageRestriction}
                  onChange={(e) => setAgeRestriction(e.target.value)}
                  placeholder="e.g. 21+"
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        )}

        <Field label="Notes" htmlFor="notes">
          <input
            id="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. with Special Guest, free entry, 21+"
            className={inputClass}
          />
        </Field>

        <Field label="Link" htmlFor="link" error={errors.link}>
          <input
            id="link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https:// — tickets, event page, etc."
            className={inputClass}
          />
        </Field>

        {!isEdit && (
          <Field label="Flyer" htmlFor="flyer" error={errors.flyer} hint="Optional — JPG, PNG, WebP, or GIF.">
            <div className="flex items-center gap-3">
              {flyerPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img
                  src={flyerPreview}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-[#E8E0D0]/15"
                />
              )}
              <input
                id="flyer"
                ref={flyerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFlyerChange}
                className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded-md file:border file:border-[#E8E0D0]/25 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0] hover:file:border-[#E8E0D0]/50"
              />
            </div>
            {flyerPreview && (
              <button
                type="button"
                onClick={removeFlyer}
                className="mt-2 text-xs text-[#E8E0D0]/50 underline underline-offset-2 hover:text-[#E8E0D0]"
              >
                Remove flyer
              </button>
            )}
          </Field>
        )}

        {/* Band section */}
        <div>
          <h2 className="text-sm font-medium text-[#E8E0D0]/85">
            Who&apos;s playing?
          </h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">
            Add one or more bands from the directory. Some shows have several
            acts.
            {isEdit &&
              " If a band isn't listed yet, type its name and pick “Add to directory”."}
          </p>

          <div className="mt-2">
            <BandSearchSelect
              bands={bands}
              selected={selectedBands}
              onAdd={addBand}
              // Edit mode has no full add-a-band form, so let the search
              // quick-add a name-only band and link it in one step.
              onQuickAdd={isEdit ? quickAddBand : undefined}
            />
          </div>

          {errors.bands && (
            <p className="mt-1 text-xs text-[#E5A0A0]">{errors.bands}</p>
          )}

          {selectedBands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedBands.map((b) => (
                <span
                  key={b.slug}
                  className="inline-flex items-center gap-1 rounded bg-[#E8E0D0]/15 px-2 py-0.5 text-xs text-[#E8E0D0]"
                >
                  {b.name}
                  <button
                    type="button"
                    aria-label={`Remove ${b.name}`}
                    onClick={() => removeBand(b.slug)}
                    className="text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {isEdit ? null : !showNewBand ? (
            <button
              type="button"
              onClick={() => setShowNewBand(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/70 transition hover:text-[#E8E0D0]"
            >
              ＋ This band isn&apos;t listed yet
            </button>
          ) : (
            <div className="mt-3 space-y-4 rounded-md bg-[rgba(232,224,208,0.05)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#E8E0D0]/85">
                  Add a band
                </p>
                <button
                  type="button"
                  onClick={cancelNewBand}
                  className="text-xs text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
                >
                  Never mind
                </button>
              </div>

              <Field label="Band name" htmlFor="newBandName" required>
                <input
                  id="newBandName"
                  type="text"
                  value={newBandName}
                  onChange={(e) => setNewBandName(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Genre(s)"
                htmlFor="newBandGenres"
                hint="Freeform — be as specific or weird as you want."
              >
                <input
                  id="newBandGenres"
                  type="text"
                  value={newBandGenres}
                  onChange={(e) => setNewBandGenres(e.target.value)}
                  placeholder="e.g. Baroque Yachtgaze, Sewer Punk"
                  className={inputClass}
                />
              </Field>

              <Field label="Location" htmlFor="newBandLocation">
                <input
                  id="newBandLocation"
                  type="text"
                  value={newBandLocation}
                  onChange={(e) => setNewBandLocation(e.target.value)}
                  placeholder="e.g. Minneapolis"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Contact email"
                htmlFor="newBandContactEmail"
                hint="Shown publicly on the band's profile. Optional."
              >
                <input
                  id="newBandContactEmail"
                  type="email"
                  value={newBandContactEmail}
                  onChange={(e) => setNewBandContactEmail(e.target.value)}
                  placeholder="band@example.com"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Instagram handle"
                htmlFor="newBandInstagram"
                hint="Just the handle, no @. Optional."
              >
                <input
                  id="newBandInstagram"
                  type="text"
                  value={newBandInstagram}
                  onChange={(e) => setNewBandInstagram(e.target.value)}
                  placeholder="yourband"
                  className={inputClass}
                />
              </Field>

              <p className="text-xs text-[#E8E0D0]/45">
                We&apos;ll add this band to the directory too.
              </p>
            </div>
          )}
        </div>

        {status === "error" && (
          <p className="rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-[#E8E0D0] px-4 py-2.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? isEdit
              ? "Saving…"
              : "Adding…"
            : isEdit
              ? "Save changes"
              : "Add show"}
        </button>
      </form>
    </div>
  );
}
