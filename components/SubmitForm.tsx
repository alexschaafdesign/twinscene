"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SHOWS_ENABLED } from "@/lib/features";

type Mode = "add" | "correct";

const BIO_MAX = 750;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const inputClass =
  "w-full rounded-md border border-ink/20 bg-transparent px-3.5 py-2 text-sm text-ink placeholder:text-ink/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ink";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cities that get a one-tap button in the picker; anything else is "Other".
const KNOWN_CITIES = ["Minneapolis", "St. Paul"] as const;

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

/** Read a file as base64, stripping the "data:image/...;base64," prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

type FormState = {
  bandName: string;
  submitterName: string;
  submitterEmail: string;
  genres: string;
  location: string; // city — persisted to the sheet's LOCATION column
  neighborhoods: string; // comma-joined; parsed into a list like genres
  members: string; // comma-joined band member names; parsed into a list
  contactEmail: string;
  contactMethod: string; // "" | "email" | "instagram" | "website" — preferred contact
  website: string;
  instagram: string;
  bandcamp: string;
  bio: string;
  notes: string;
};

type ShowInput = {
  date: string;
  venue: string;
  notes: string;
  link: string;
};

const emptyShow = (): ShowInput => ({
  date: "",
  venue: "",
  notes: "",
  link: "",
});

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
        className="mb-1 block text-sm text-ink/85"
      >
        {label}
        {required && <span className="text-ink/50"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-ink/45">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * A titled group of related fields. A hairline top rule plus a small uppercase
 * label give the long form a subtle visual rhythm without heavy boxes.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink/10 pt-6">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/45">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-ink/45">{description}</p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
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
        } bg-transparent px-2 py-1.5 text-sm transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-ink`}
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

export default function SubmitForm({
  mode = "add",
  initialSlug = "",
  initialName = "",
  initialGenres = "",
  initialLocation = "",
  initialNeighborhoods = "",
  initialMembers = "",
  initialContactEmail = "",
  initialContactMethod = "",
  initialWebsite = "",
  initialInstagram = "",
  initialBandcamp = "",
  initialBio = "",
  initialImage = "",
  initialFeaturedLinks = "",
  genreOptions = [],
  neighborhoodOptions = [],
  memberOptions = [],
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialGenres?: string;
  initialLocation?: string;
  initialNeighborhoods?: string;
  initialMembers?: string;
  initialContactEmail?: string;
  initialContactMethod?: string;
  initialWebsite?: string;
  initialInstagram?: string;
  initialBandcamp?: string;
  initialBio?: string;
  initialImage?: string;
  initialFeaturedLinks?: string;
  genreOptions?: string[];
  neighborhoodOptions?: string[];
  memberOptions?: string[];
}) {
  const [form, setForm] = useState<FormState>({
    bandName: initialName,
    submitterName: "",
    submitterEmail: "",
    genres: initialGenres,
    location: initialLocation,
    neighborhoods: initialNeighborhoods,
    members: initialMembers,
    contactEmail: initialContactEmail,
    contactMethod: initialContactMethod,
    website: initialWebsite,
    instagram: initialInstagram,
    bandcamp: initialBandcamp,
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
  // Optional upcoming shows. Always at least one (possibly empty) row on screen.
  const [shows, setShows] = useState<ShowInput[]>([emptyShow()]);
  // Featured "linktree" links — three fixed slots (url + label).
  const [featuredLinks, setFeaturedLinks] = useState<LinkInput[]>(() =>
    initialFeaturedLinkSlots(initialFeaturedLinks),
  );
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

  function updateShow(index: number, key: keyof ShowInput, value: string) {
    setShows((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    );
  }

  function addShow() {
    setShows((prev) => [...prev, emptyShow()]);
  }

  function removeShow(index: number) {
    // Removing the last remaining row just clears it back to one empty row.
    setShows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyShow()];
    });
  }

  function updateFeaturedLink(index: number, key: keyof LinkInput, value: string) {
    setFeaturedLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    );
  }

  const isCorrect = mode === "correct";
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
    // Temporarily skip submitter name/email in correction mode — the directory
    // is privately maintained by one or two people, so it's needless friction.
    if (!isCorrect) {
      if (!form.submitterName.trim()) e.submitterName = "Required";
      if (!form.submitterEmail.trim()) e.submitterEmail = "Required";
      else if (!EMAIL_RE.test(form.submitterEmail.trim()))
        e.submitterEmail = "Enter a valid email address";
    }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);

    // A photo is required when adding a band, but optional for corrections.
    let imgErr = "";
    if (!imageFile) {
      if (!isCorrect) imgErr = "Required";
    } else if (imageFile.size > MAX_IMAGE_BYTES) {
      imgErr = "Image too large — please use a file under 8MB";
    }
    setImageError(imgErr);

    if (Object.keys(found).length > 0 || imgErr) {
      const ids = Object.keys(found);
      if (imgErr) ids.push("bandPhoto");
      focusFirstError(ids);
      return;
    }

    const url = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
    if (!url) {
      setStatus("error");
      setErrorMsg(
        "Submission endpoint isn't configured yet. Please email alex@thebirdhaus.org.",
      );
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const bandSlug =
        isCorrect && initialSlug ? initialSlug : slugify(form.bandName);

      const payload = new URLSearchParams({
        ...form,
        existingSlug: isCorrect ? initialSlug : "",
        mode,
        bandSlug,
        // Signals the Apps Script to blank the IMAGE column when no new photo
        // is uploaded. Ignored server-side when a new imageBase64 is present.
        removeImage: removeExistingImage ? "true" : "false",
      });

      // Only send the photo if one was selected. Omitting the fields
      // entirely (rather than sending empty strings) lets the Apps Script's
      // `if (p.imageBase64)` check skip the image update on corrections.
      // base64 inflates the payload ~33%, but that's fine for Apps Script.
      if (imageFile) {
        payload.set("imageBase64", await fileToBase64(imageFile));
        payload.set("imageMimeType", imageFile.type);
      }

      // Shows are optional and feature-flagged. Only include rows with at least
      // a date or venue, serialized as JSON the Apps Script parses into rows.
      if (SHOWS_ENABLED) {
        const filledShows = shows
          .filter((s) => s.date.trim() || s.venue.trim())
          .map((s) => ({
            date: s.date.trim(),
            venue: s.venue.trim(),
            notes: s.notes.trim(),
            link: s.link.trim(),
          }));
        if (filledShows.length > 0) {
          payload.set("shows", JSON.stringify(filledShows));
        }
      }

      // Featured links — keep only rows with a URL, in slot order. Always send
      // the key (even when empty) so clearing every link on a correction wipes
      // the stored value rather than leaving the old one.
      const filledLinks = featuredLinks
        .filter((l) => l.url.trim())
        .map((l) => ({ url: l.url.trim(), label: l.label.trim() }));
      payload.set("featuredLinks", JSON.stringify(filledLinks));

      // Form-encoded body keeps this a "simple" CORS request (no preflight),
      // matching the Birdhaus RSVP webhook pattern.
      const res = await fetch(url, { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Submission failed");
      }
      setSubmittedSlug(bandSlug);
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

  return (
    <div className="rounded-lg border border-ink/15 bg-paper p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          {heading}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70">
          {subhead}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <Section title="The basics">
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
              value={
                form.genres
                  ? form.genres.split(",").map((s) => s.trim()).filter(Boolean)
                  : []
              }
              onChange={(next) => {
                setForm((f) => ({ ...f, genres: next.join(", ") }));
                clearError("genres");
              }}
              hasError={!!errors.genres}
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
              value={
                form.neighborhoods
                  ? form.neighborhoods
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : []
              }
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
              value={
                form.members
                  ? form.members
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : []
              }
              onChange={(next) =>
                setForm((f) => ({ ...f, members: next.join(", ") }))
              }
            />
          </Field>
        </Section>

        <Section
          title="Links & contact"
          description="Where fans and bookers can find and reach you."
        >
          <div>
            <span className="mb-1 block text-sm text-ink/85">
              How do you want to be contacted?
            </span>
            <div className="flex gap-2">
              {(["email", "instagram", "website"] as const).map((m) => {
                const active = form.contactMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    // Clicking the active choice again clears it (the choice is optional).
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        contactMethod: active ? "" : m,
                      }))
                    }
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-ink/25 text-ink/70 hover:border-ink/60"
                    }`}
                  >
                    {m === "email"
                      ? "Email"
                      : m === "instagram"
                        ? "Instagram"
                        : "Website"}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-ink/45">
              Optional — choosing one makes that field required below.
            </p>
          </div>

          <Field
            label="Contact email"
            htmlFor="contactEmail"
            required={form.contactMethod === "email"}
            error={errors.contactEmail}
            hint="Shown publicly on your profile so people can reach you."
          >
            <input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={set("contactEmail")}
              placeholder="band@example.com"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Website"
              htmlFor="website"
              required={form.contactMethod === "website"}
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
              required={form.contactMethod === "instagram"}
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
          </div>
        </Section>

        <Section
          title="Embeddable music player"
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
        </Section>

        <Section
          title="Featured links"
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
        </Section>

        <Section title="Bio & photo">
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
        </Section>

        <Section
          title={isCorrect ? "Anything else" : "About you"}
          description={
            isCorrect
              ? undefined
              : "So we can follow up on your submission — never shown publicly."
          }
        >
          {/* Temporarily hidden in correction mode — privately maintained. */}
          {!isCorrect && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Your name"
                htmlFor="submitterName"
                required
                error={errors.submitterName}
              >
                <input
                  id="submitterName"
                  type="text"
                  value={form.submitterName}
                  onChange={set("submitterName")}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Your email"
                htmlFor="submitterEmail"
                required
                error={errors.submitterEmail}
              >
                <input
                  id="submitterEmail"
                  type="email"
                  value={form.submitterEmail}
                  onChange={set("submitterEmail")}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <Field
            label="Additional notes"
            htmlFor="notes"
            hint="Anything else we should know, or what you're correcting."
          >
            <textarea
              id="notes"
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </Section>

        {/* Upcoming shows — feature-flagged; hidden while shows are disabled. */}
        {SHOWS_ENABLED && (
        <Section
          title="Upcoming shows"
          description="Let people know where to catch you live."
        >
          <div className="space-y-3">
            {shows.map((show, i) => (
              <div
                key={i}
                className="relative rounded-md bg-ink/5 p-4 pr-10"
              >
                <button
                  type="button"
                  aria-label="Remove this show"
                  onClick={() => removeShow(i)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink/20 text-sm leading-none text-ink/70 transition hover:text-ink"
                >
                  ×
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`show-${i}-date`}
                      className="mb-1 block text-xs text-ink/70"
                    >
                      Date
                    </label>
                    <input
                      id={`show-${i}-date`}
                      type="date"
                      value={show.date}
                      onChange={(e) => updateShow(i, "date", e.target.value)}
                      className={`${inputClass} [color-scheme:light]`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`show-${i}-venue`}
                      className="mb-1 block text-xs text-ink/70"
                    >
                      Venue
                    </label>
                    <input
                      id={`show-${i}-venue`}
                      type="text"
                      value={show.venue}
                      onChange={(e) => updateShow(i, "venue", e.target.value)}
                      placeholder="e.g. 7th St Entry"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`show-${i}-notes`}
                      className="mb-1 block text-xs text-ink/70"
                    >
                      Notes
                    </label>
                    <input
                      id={`show-${i}-notes`}
                      type="text"
                      value={show.notes}
                      onChange={(e) => updateShow(i, "notes", e.target.value)}
                      placeholder="e.g. w/ other band, free entry"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`show-${i}-link`}
                      className="mb-1 block text-xs text-ink/70"
                    >
                      Link
                    </label>
                    <input
                      id={`show-${i}-link`}
                      type="url"
                      value={show.link}
                      onChange={(e) => updateShow(i, "link", e.target.value)}
                      placeholder="https://"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addShow}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-ink/30 px-3 py-1.5 text-sm text-ink/80 transition hover:bg-ink/10 hover:text-ink"
          >
            + Add another show
          </button>
        </Section>
        )}

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

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? "Submitting…"
            : isCorrect
              ? "Submit correction"
              : "Submit your band"}
        </button>
      </form>
    </div>
  );
}
