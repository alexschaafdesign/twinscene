"use client";

import Link from "next/link";
import { useState } from "react";
import { slugify } from "@/lib/venueUtils";

// Shared input styling, kept in sync with SubmitForm.tsx / ShowSubmitForm.tsx.
const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cities that get a one-tap button in the picker; anything else is "Other".
const KNOWN_CITIES = ["Minneapolis", "St. Paul"] as const;

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

type Mode = "add" | "correct";

export default function VenueSubmitForm({
  mode = "add",
  initialSlug = "",
  initialName = "",
  initialLocation = "",
  initialNeighborhood = "",
  initialCapacity = "",
  initialContact = "",
  initialType = "",
  initialOwner = "",
  initialParking = "",
  initialAccessibility = "",
  initialNotes = "",
  neighborhoodOptions = [],
  typeOptions = [],
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialLocation?: string;
  initialNeighborhood?: string;
  initialCapacity?: string;
  initialContact?: string;
  initialType?: string;
  initialOwner?: string;
  initialParking?: string;
  initialAccessibility?: string;
  initialNotes?: string;
  neighborhoodOptions?: string[];
  typeOptions?: string[];
}) {
  const isCorrect = mode === "correct";

  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [cityIsOther, setCityIsOther] = useState(
    () =>
      !!initialLocation &&
      !KNOWN_CITIES.includes(initialLocation as (typeof KNOWN_CITIES)[number]),
  );
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [contact, setContact] = useState(initialContact);
  const [type, setType] = useState(initialType);
  const [owner, setOwner] = useState(initialOwner);
  const [parking, setParking] = useState(initialParking);
  const [accessibility, setAccessibility] = useState(initialAccessibility);
  const [notes, setNotes] = useState(initialNotes);
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [submittedSlug, setSubmittedSlug] = useState("");

  const heading = isCorrect ? "Edit this venue" : "Add a venue";
  const subhead = isCorrect
    ? "Spot something wrong or out of date? Update it below."
    : "Add a venue to the directory.";

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    if (!submitterName.trim()) e.submitterName = "Required";
    if (!submitterEmail.trim()) e.submitterEmail = "Required";
    else if (!EMAIL_RE.test(submitterEmail.trim()))
      e.submitterEmail = "Enter a valid email address";
    if (capacity.trim() && !/^\d+$/.test(capacity.trim())) {
      e.capacity = "Enter a whole number";
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
      const venueSlug =
        isCorrect && initialSlug ? initialSlug : slugify(name.trim());

      const payload = new FormData();
      payload.set("mode", mode);
      payload.set("existingSlug", isCorrect ? initialSlug : "");
      payload.set("venueName", name.trim());
      payload.set("location", location.trim());
      payload.set("neighborhood", neighborhood.trim());
      payload.set("capacity", capacity.trim());
      payload.set("contact", contact.trim());
      payload.set("type", type.trim());
      payload.set("owner", owner.trim());
      payload.set("parking", parking.trim());
      payload.set("accessibility", accessibility.trim());
      payload.set("notes", notes.trim());

      const res = await fetch("/api/venues/submit", { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Submission failed");
      }
      setSubmittedSlug(typeof data.slug === "string" ? data.slug : venueSlug);
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
    const venueHref = submittedSlug ? `/venues/${submittedSlug}` : "/venues";
    return (
      <div className="rounded-lg border border-[#E8E0D0]/15 p-8 text-center">
        <h2 className="text-xl font-medium">
          {isCorrect ? "Thanks for the updates!" : "Venue added!"}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#E8E0D0]/75">
          {isCorrect
            ? "If the changes don't appear immediately, give it a minute or so."
            : "It'll appear in the directory shortly."}
        </p>
        <Link
          href={venueHref}
          className="mt-6 inline-block rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          {submittedSlug ? `View ${name || "venue"} →` : "← Venues"}
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
        <Field label="Venue name" htmlFor="name" required error={errors.name}>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 7th St Entry"
            className={inputClass}
          />
        </Field>

        <Field label="City" htmlFor="location">
          <div className="flex flex-wrap gap-2">
            {KNOWN_CITIES.map((c) => {
              const active = !cityIsOther && location === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCityIsOther(false);
                    setLocation(c);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                      : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
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
                if (
                  KNOWN_CITIES.includes(
                    location as (typeof KNOWN_CITIES)[number],
                  )
                ) {
                  setLocation("");
                }
              }}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                cityIsOther
                  ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                  : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
              }`}
            >
              Other
            </button>
          </div>
          {cityIsOther && (
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Duluth, Hopkins"
              className={`${inputClass} mt-2`}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Neighborhood" htmlFor="neighborhood">
            <input
              id="neighborhood"
              list="neighborhood-options"
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="e.g. Seward"
              className={inputClass}
            />
            <datalist id="neighborhood-options">
              {neighborhoodOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Type"
            htmlFor="type"
            hint="Freeform — e.g. DIY, Independent, Brewery"
          >
            <input
              id="type"
              list="type-options"
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. DIY"
              className={inputClass}
            />
            <datalist id="type-options">
              {typeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Capacity" htmlFor="capacity" error={errors.capacity}>
            <input
              id="capacity"
              type="text"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 250"
              className={inputClass}
            />
          </Field>

          <Field label="Owner" htmlFor="owner">
            <input
              id="owner"
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Contact"
          htmlFor="contact"
          hint="Booking email, phone, or Instagram — shown publicly on the venue's profile."
        >
          <input
            id="contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Parking" htmlFor="parking">
          <textarea
            id="parking"
            rows={2}
            value={parking}
            onChange={(e) => setParking(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Accessibility" htmlFor="accessibility">
          <textarea
            id="accessibility"
            rows={2}
            value={accessibility}
            onChange={(e) => setAccessibility(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
              : "Submit venue"}
        </button>
      </form>
    </div>
  );
}
