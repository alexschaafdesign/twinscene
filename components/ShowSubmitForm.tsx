"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Shared input styling, kept in sync with SubmitForm.tsx.
const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * renders the chips). Mirrors the keyboard/mouse behaviour of the genre
 * tag-input on the band form.
 */
function BandSearchSelect({
  bands,
  selected,
  onAdd,
}: {
  bands: BandOption[];
  selected: BandOption[];
  onAdd: (band: BandOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSlugs = new Set(selected.map((b) => b.slug));
  const qLower = query.trim().toLowerCase();
  const matches = bands
    .filter(
      (b) =>
        !selectedSlugs.has(b.slug) &&
        (qLower === "" || b.name.toLowerCase().includes(qLower)),
    )
    .slice(0, 8);

  const activeIndex = highlight < matches.length ? highlight : 0;

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
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (matches.length ? (h + 1) % matches.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        matches.length ? (h - 1 + matches.length) % matches.length : 0,
      );
      return;
    }
    if (e.key === "Enter") {
      // Never submit the form from the search box.
      e.preventDefault();
      if (open && matches.length > 0) choose(matches[activeIndex]);
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
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] py-1 shadow-lg">
          {matches.map((b, i) => (
            <li key={b.slug}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // Select before the input blurs and closes the dropdown.
                  e.preventDefault();
                  choose(b);
                }}
                className={`block w-full px-3 py-2 text-left text-sm text-[#E8E0D0] ${
                  i === activeIndex ? "bg-[#E8E0D0]/10" : ""
                }`}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ShowSubmitForm({ bands }: { bands: BandOption[] }) {
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");

  const [selectedBands, setSelectedBands] = useState<BandOption[]>([]);
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
    setSubmitterName("");
    setSubmitterEmail("");
    setSelectedBands([]);
    cancelNewBand();
    setErrors({});
    setErrorMsg("");
    setStatus("idle");
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!date.trim()) e.date = "Required";
    if (!venue.trim()) e.venue = "Required";
    if (!submitterName.trim()) e.submitterName = "Required";
    if (!submitterEmail.trim()) e.submitterEmail = "Required";
    else if (!EMAIL_RE.test(submitterEmail.trim()))
      e.submitterEmail = "Enter a valid email address";
    if (link.trim() && !isValidUrl(link.trim())) e.link = "Enter a valid URL";

    const hasNewBand = showNewBand && !!newBandName.trim();
    if (selectedBands.length === 0 && !hasNewBand) {
      e.bands = "Add at least one band, or add a new one below.";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

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
      const payload = new URLSearchParams({
        formType: "show",
        date: date.trim(),
        venue: venue.trim(),
        notes: notes.trim(),
        link: link.trim(),
        submitterName: submitterName.trim(),
        submitterEmail: submitterEmail.trim(),
        bandSlugs: selectedBands.map((b) => b.slug).join(","),
        bandNames: selectedBands.map((b) => b.name).join(","),
      });

      if (showNewBand && newBandName.trim()) {
        payload.set("newBandName", newBandName.trim());
        payload.set("newBandGenres", newBandGenres.trim());
        payload.set("newBandLocation", newBandLocation.trim());
        payload.set("newBandContactEmail", newBandContactEmail.trim());
        payload.set("newBandInstagram", newBandInstagram.trim());
      }

      const res = await fetch(url, { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Submission failed");
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
        <h2 className="text-xl font-medium">Show added!</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#E8E0D0]/75">
          It&apos;ll appear on the shows page shortly.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/shows"
            className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
          >
            ← Upcoming Shows
          </Link>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90"
          >
            Add another show
          </button>
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Add a Show
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">
          List an upcoming show for a band in the directory. We review
          submissions before they appear on the shows page.
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
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
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
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Band section */}
        <div>
          <h2 className="text-sm font-medium text-[#E8E0D0]/85">
            Who&apos;s playing?
          </h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">
            Add one or more bands from the directory. Some shows have several
            acts.
          </p>

          <div className="mt-2">
            <BandSearchSelect
              bands={bands}
              selected={selectedBands}
              onAdd={addBand}
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

          {!showNewBand ? (
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
          {submitting ? "Adding…" : "Add show"}
        </button>
      </form>
    </div>
  );
}
