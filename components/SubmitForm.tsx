"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SHOWS_ENABLED } from "@/lib/features";

type Mode = "add" | "correct";

const BIO_MAX = 750;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  location: string;
  contactEmail: string;
  contactMethod: string; // "" | "email" | "instagram" — preferred contact
  started: string;
  website: string;
  instagram: string;
  bandcamp: string;
  spotify: string;
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
        className="mb-1 block text-sm text-[#E8E0D0]/85"
      >
        {label}
        {required && <span className="text-[#E8E0D0]/50"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-[#E8E0D0]/45">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-[#E5A0A0]">{error}</p>}
    </div>
  );
}

/**
 * Tag-input with autocomplete for genres. Selected genres render as removable
 * chips; typing filters `options`, and an "Add '…'" entry lets the user create
 * a genre that isn't in the list yet. Value is the array of selected genres.
 */
function GenreTagInput({
  id,
  value,
  options,
  onChange,
  hasError,
}: {
  id: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  hasError?: boolean;
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

  function addGenre(genre: string) {
    const trimmed = genre.trim();
    if (!trimmed) return;
    if (!selectedLower.includes(trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function removeGenre(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      removeGenre(value.length - 1);
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
        addGenre(items[activeIndex]?.value ?? "");
      } else if (q) {
        // Don't submit the form while a genre is half-typed.
        e.preventDefault();
        addGenre(q);
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[2.6rem] w-full flex-wrap items-center gap-1.5 rounded-md border ${
          hasError ? "border-[#E5A0A0]/60" : "border-[#E8E0D0]/20"
        } bg-transparent px-2 py-1.5 text-sm transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#E8E0D0]`}
      >
        {value.map((genre, i) => (
          <span
            key={`${genre}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-[#E8E0D0]/15 px-2 py-0.5 text-xs text-[#E8E0D0]"
          >
            {genre}
            <button
              type="button"
              aria-label={`Remove ${genre}`}
              onClick={(e) => {
                e.stopPropagation();
                removeGenre(i);
              }}
              className="text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
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
          placeholder={
            value.length === 0 ? "e.g. Baroque Yachtgaze, Sewer Punk" : ""
          }
          className="min-w-[8rem] flex-1 bg-transparent text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 focus:outline-none"
        />
      </div>

      {open && items.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] py-1 shadow-lg">
          {items.map((item, i) => (
            <li key={item.type === "add" ? `__add__${item.value}` : item.value}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // Select before the input blurs and closes the dropdown.
                  e.preventDefault();
                  addGenre(item.value);
                }}
                className={`block w-full px-3 py-2 text-left text-sm text-[#E8E0D0] ${
                  i === activeIndex ? "bg-[#E8E0D0]/10" : ""
                } ${item.type === "add" ? "italic text-[#E8E0D0]/80" : ""}`}
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
  initialContactEmail = "",
  initialContactMethod = "",
  initialStarted = "",
  initialWebsite = "",
  initialInstagram = "",
  initialBandcamp = "",
  initialSpotify = "",
  initialBio = "",
  initialImage = "",
  genreOptions = [],
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialGenres?: string;
  initialLocation?: string;
  initialContactEmail?: string;
  initialContactMethod?: string;
  initialStarted?: string;
  initialWebsite?: string;
  initialInstagram?: string;
  initialBandcamp?: string;
  initialSpotify?: string;
  initialBio?: string;
  initialImage?: string;
  genreOptions?: string[];
}) {
  const [form, setForm] = useState<FormState>({
    bandName: initialName,
    submitterName: "",
    submitterEmail: "",
    genres: initialGenres,
    location: initialLocation,
    contactEmail: initialContactEmail,
    contactMethod: initialContactMethod,
    started: initialStarted,
    website: initialWebsite,
    instagram: initialInstagram,
    bandcamp: initialBandcamp,
    spotify: initialSpotify,
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
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Slug of the band just submitted, so the success screen can link to its
  // profile page (set from the same bandSlug sent in the payload).
  const [submittedSlug, setSubmittedSlug] = useState("");

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

  const set =
    (key: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

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

  const isCorrect = mode === "correct";
  // Show the band's current photo only in correction mode, while it hasn't
  // been removed and no new file has been chosen (a new file takes precedence).
  const showExistingImage =
    isCorrect && !!initialImage && !removeExistingImage && !imageFile;
  const heading = isCorrect ? "Suggest a correction" : "Add your band";
  const subhead = isCorrect
    ? "Spot something wrong or out of date? Let us know and we'll update it."
    : "Submit your band for inclusion in the directory. We review all submissions and add approved bands manually — usually within a week.";

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

    if (Object.keys(found).length > 0 || imgErr) return;

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
      <div className="rounded-lg border border-[#E8E0D0]/20 p-8 text-center">
        <h2 className="text-xl font-medium">
          {isCorrect ? "Thanks for the updates!" : "Thanks!"}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#E8E0D0]/75">
          {isCorrect
            ? "If the changes don't appear immediately, give it a minute or so."
            : "Your band's been added — if it doesn't appear immediately, give it a minute or so."}
        </p>
        <Link
          href={bandHref}
          className="mt-6 inline-block rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          {submittedSlug ? `View ${form.bandName || "band"} →` : "← Back to directory"}
        </Link>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          {heading}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">
          {subhead}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
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

        {/* Temporarily hidden in correction mode — privately maintained. */}
        {!isCorrect && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Your name"
              htmlFor="submitterName"
              required
              error={errors.submitterName}
              hint="Not for publication"
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
              hint="For follow-up, not published"
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
          label="Genre(s)"
          htmlFor="genres"
          required
          error={errors.genres}
          hint="Pick from existing genres or type your own — be as specific or weird as you want."
        >
          <GenreTagInput
            id="genres"
            options={genreOptions}
            value={
              form.genres
                ? form.genres.split(",").map((s) => s.trim()).filter(Boolean)
                : []
            }
            onChange={(next) =>
              setForm((f) => ({ ...f, genres: next.join(", ") }))
            }
            hasError={!!errors.genres}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Location"
            htmlFor="location"
            required
            error={errors.location}
          >
            <input
              id="location"
              type="text"
              value={form.location}
              onChange={set("location")}
              placeholder="e.g. Minneapolis"
              className={inputClass}
            />
          </Field>

          <Field label="Year started" htmlFor="started">
            <input
              id="started"
              type="number"
              inputMode="numeric"
              value={form.started}
              onChange={set("started")}
              placeholder="e.g. 2019"
              className={inputClass}
            />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-sm text-[#E8E0D0]/85">
            How do you want to be contacted?
          </span>
          <div className="flex gap-2">
            {(["email", "instagram"] as const).map((m) => {
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
                      ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                      : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                  }`}
                >
                  {m === "email" ? "Email" : "Instagram"}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">
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
          <Field label="Website" htmlFor="website">
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

        <div className="grid gap-5 sm:grid-cols-2">
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

          <Field label="Spotify URL" htmlFor="spotify">
            <input
              id="spotify"
              type="url"
              value={form.spotify}
              onChange={set("spotify")}
              placeholder="https://"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Short bio" htmlFor="bio">
          <textarea
            id="bio"
            value={form.bio}
            onChange={set("bio")}
            maxLength={BIO_MAX}
            rows={4}
            className={`${inputClass} resize-y`}
          />
          <p className="mt-1 text-right text-xs text-[#E8E0D0]/45">
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
            className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-[#E8E0D0]/15 file:px-3 file:py-1 file:text-sm file:text-[#E8E0D0]`}
          />
          {previewUrl && (
            <div className="relative mt-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected band photo preview"
                className="h-60 w-60 rounded-md border border-[#E8E0D0]/20 object-cover"
              />
              <button
                type="button"
                aria-label="Remove selected photo"
                onClick={clearImageFile}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E0D0]/20 bg-[#2A2420]/90 text-sm leading-none text-[#E8E0D0]/80 transition hover:text-[#E8E0D0]"
              >
                ×
              </button>
            </div>
          )}
          {showExistingImage && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-[#E8E0D0]/60">Current photo:</p>
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={initialImage}
                  alt="Current band photo"
                  className="h-60 w-60 rounded-md border border-[#E8E0D0]/20 object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove current photo"
                  onClick={() => setRemoveExistingImage(true)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E0D0]/20 bg-[#2A2420]/90 text-sm leading-none text-[#E8E0D0]/80 transition hover:text-[#E8E0D0]"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </Field>

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

        {/* Upcoming shows — feature-flagged; hidden while shows are disabled. */}
        {SHOWS_ENABLED && (
        <div>
          <h2 className="text-sm font-medium text-[#E8E0D0]/85">
            Upcoming shows
          </h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">
            Let people know where to catch you live.
          </p>

          <div className="mt-3 space-y-3">
            {shows.map((show, i) => (
              <div
                key={i}
                className="relative rounded-md bg-[rgba(232,224,208,0.05)] p-4 pr-10"
              >
                <button
                  type="button"
                  aria-label="Remove this show"
                  onClick={() => removeShow(i)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E0D0]/20 text-sm leading-none text-[#E8E0D0]/70 transition hover:text-[#E8E0D0]"
                >
                  ×
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`show-${i}-date`}
                      className="mb-1 block text-xs text-[#E8E0D0]/70"
                    >
                      Date
                    </label>
                    <input
                      id={`show-${i}-date`}
                      type="date"
                      value={show.date}
                      onChange={(e) => updateShow(i, "date", e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`show-${i}-venue`}
                      className="mb-1 block text-xs text-[#E8E0D0]/70"
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
                      className="mb-1 block text-xs text-[#E8E0D0]/70"
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
                      className="mb-1 block text-xs text-[#E8E0D0]/70"
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
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#E8E0D0]/30 px-3 py-1.5 text-sm text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
          >
            + Add another show
          </button>
        </div>
        )}

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
            ? "Submitting…"
            : isCorrect
              ? "Submit correction"
              : "Submit your band"}
        </button>
      </form>
    </div>
  );
}
