"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { slugify } from "@/lib/venueUtils";

// Shared input styling, kept in sync with SubmitForm.tsx / ShowSubmitForm.tsx.
const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

// Keeps the multipart body comfortably under Vercel Functions' request-body
// cap. Mirrors SubmitForm.tsx.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB

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

// A plausible US street address for a venue: a house number (optionally with a
// unit letter like "123A"), then a street name. This is what the Census
// geocoder needs to resolve for "Detect from address", and it rejects obvious
// free-text ("downtown", "the old warehouse") without being strict about the
// street name itself, so out-of-town addresses still pass.
const STREET_ADDRESS_RE = /^\d+[A-Za-z]?\s+\S/;

type Mode = "add" | "correct";

export default function VenueSubmitForm({
  mode = "add",
  initialSlug = "",
  initialName = "",
  initialAddress = "",
  initialAddressPrivate = false,
  initialManualScrape = false,
  initialLocation = "",
  initialNeighborhood = "",
  initialCapacity = "",
  initialContact = "",
  initialType = "",
  initialOwner = "",
  initialParking = "",
  initialAccessibility = "",
  initialNotes = "",
  initialImage = "",
  initialShortName = "",
  initialAvatarInitials = "",
  neighborhoodOptions = [],
  typeOptions = [],
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialAddress?: string;
  initialAddressPrivate?: boolean;
  initialManualScrape?: boolean;
  initialLocation?: string;
  initialNeighborhood?: string;
  initialCapacity?: string;
  initialContact?: string;
  initialType?: string;
  initialOwner?: string;
  initialParking?: string;
  initialAccessibility?: string;
  initialNotes?: string;
  initialImage?: string;
  initialShortName?: string;
  initialAvatarInitials?: string;
  neighborhoodOptions?: string[];
  typeOptions?: string[];
}) {
  const isCorrect = mode === "correct";

  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [addressPrivate, setAddressPrivate] = useState(initialAddressPrivate);
  const [manualScrape, setManualScrape] = useState(initialManualScrape);
  const [location, setLocation] = useState(initialLocation);
  const [cityIsOther, setCityIsOther] = useState(
    () =>
      !!initialLocation &&
      !KNOWN_CITIES.includes(initialLocation as (typeof KNOWN_CITIES)[number]),
  );
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood);
  // "Detect neighborhood from address" state.
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [capacity, setCapacity] = useState(initialCapacity);
  const [contact, setContact] = useState(initialContact);
  const [type, setType] = useState(initialType);
  const [owner, setOwner] = useState(initialOwner);
  const [parking, setParking] = useState(initialParking);
  const [accessibility, setAccessibility] = useState(initialAccessibility);
  const [notes, setNotes] = useState(initialNotes);
  const [shortName, setShortName] = useState(initialShortName);
  const [avatarInitials, setAvatarInitials] = useState(initialAvatarInitials);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  // Correction flow: whether the user asked to remove the venue's current photo.
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Only show the "current photo" block in correction mode, when there is one,
  // and it hasn't been marked for removal.
  const showExistingImage = isCorrect && !!initialImage && !removeExistingImage;

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
    // Only validate an address that's actually entered — the field is optional,
    // and a "private" venue stores no address at all.
    if (!addressPrivate && address.trim() && !STREET_ADDRESS_RE.test(address.trim())) {
      e.address =
        "Enter a street address, e.g. 701 1st Ave N (house number + street).";
    }
    if (capacity.trim() && !/^\d+$/.test(capacity.trim())) {
      e.capacity = "Enter a whole number";
    }
    return e;
  }

  /** Look the neighborhood up from the address via the Census geocoder +
   * bundled Minneapolis/St. Paul boundaries, and fill the field. Also fills
   * City when the match tells us which city and City is still empty. */
  async function detectNeighborhood() {
    if (detecting) return;
    if (!address.trim()) {
      setDetectMsg("Enter an address first.");
      return;
    }
    setDetecting(true);
    setDetectMsg("");
    try {
      const res = await fetch("/api/venues/detect-neighborhood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), city: location.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Couldn't detect the neighborhood.");
      }
      if (data.neighborhood) {
        setNeighborhood(data.neighborhood);
        // Fill City from the match only if the user hasn't set one.
        if (data.city && !location.trim()) {
          setCityIsOther(
            !KNOWN_CITIES.includes(data.city as (typeof KNOWN_CITIES)[number]),
          );
          setLocation(data.city);
        }
        setDetectMsg(`Found: ${data.neighborhood}`);
      } else {
        setDetectMsg(data.reason || "No neighborhood found for that address.");
      }
    } catch (err) {
      setDetectMsg(
        err instanceof Error ? err.message : "Couldn't detect the neighborhood.",
      );
    } finally {
      setDetecting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);

    let imgErr = "";
    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
      imgErr = "Image too large — please use a file under 4MB";
    }
    setImageError(imgErr);

    if (Object.keys(found).length > 0 || imgErr) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const venueSlug =
        isCorrect && initialSlug ? initialSlug : slugify(name.trim());

      const payload = new FormData();
      payload.set("mode", mode);
      payload.set("existingSlug", isCorrect ? initialSlug : "");
      payload.set("venueSlug", venueSlug);
      payload.set("venueName", name.trim());
      payload.set("address", addressPrivate ? "" : address.trim());
      payload.set("addressPrivate", addressPrivate ? "true" : "false");
      payload.set("manualScrape", manualScrape ? "true" : "false");
      payload.set("location", location.trim());
      payload.set("neighborhood", neighborhood.trim());
      payload.set("capacity", capacity.trim());
      payload.set("contact", contact.trim());
      payload.set("type", type.trim());
      payload.set("owner", owner.trim());
      payload.set("parking", parking.trim());
      payload.set("accessibility", accessibility.trim());
      payload.set("notes", notes.trim());
      payload.set("shortName", shortName.trim());
      payload.set("avatarInitials", avatarInitials.trim());
      // Signals the server to blank the photo when no new one is uploaded.
      payload.set("removeImage", removeExistingImage ? "true" : "false");

      // Only send the photo if one was selected — the server leaves the
      // existing photo alone when this field is absent.
      if (imageFile) {
        payload.set("photo", imageFile);
      }

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

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Short name"
            htmlFor="shortName"
            hint='Shown on directory cards, e.g. "The Cedar" for "Cedar Cultural Center". Falls back to the venue name if blank.'
          >
            <input
              id="shortName"
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder={name || "e.g. The Cedar"}
              className={inputClass}
            />
          </Field>

          <Field
            label="Avatar label"
            htmlFor="avatarInitials"
            hint='Shown on the avatar — usually 2-3 letters like "TC", but a short word like "Caydence" fits too. Auto-derived from the name if blank.'
          >
            <input
              id="avatarInitials"
              type="text"
              maxLength={20}
              value={avatarInitials}
              onChange={(e) => setAvatarInitials(e.target.value)}
              placeholder="e.g. TC"
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Address"
          htmlFor="address"
          error={errors.address}
          hint={
            addressPrivate
              ? "The profile will show “DM venue for address” instead of a street address."
              : "Street address, e.g. 701 1st Ave N"
          }
        >
          {!addressPrivate && (
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (errors.address) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.address;
                    return next;
                  });
                }
              }}
              placeholder="e.g. 701 1st Ave N"
              className={inputClass}
            />
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-[#E8E0D0]/80">
            <input
              type="checkbox"
              checked={addressPrivate}
              onChange={(e) => {
                const on = e.target.checked;
                setAddressPrivate(on);
                // A private venue stores no address — clear anything typed.
                if (on) setAddress("");
              }}
              className="h-4 w-4 accent-[#E8E0D0]"
            />
            Private — people DM the venue for the address
          </label>
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
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={detectNeighborhood}
                disabled={detecting || !address.trim()}
                className="text-xs text-[#E8E0D0]/70 underline underline-offset-2 transition hover:text-[#E8E0D0] disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              >
                {detecting ? "Detecting…" : "Detect from address"}
              </button>
              {detectMsg && (
                <span className="text-xs text-[#E8E0D0]/50">{detectMsg}</span>
              )}
            </div>
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

        <div className="rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.04)] p-4">
          <label className="flex items-start gap-2.5 text-sm text-[#E8E0D0]/85">
            <input
              type="checkbox"
              checked={manualScrape}
              onChange={(e) => setManualScrape(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#E8E0D0]"
            />
            <span>
              Manual scrape required
              <span className="mt-0.5 block text-xs text-[#E8E0D0]/50">
                No auto-scraper for this venue — its shows have to be entered by
                hand. It&apos;ll show up in the admin scraper panel&apos;s
                &ldquo;Manual scrape required&rdquo; reminder list.
              </span>
            </span>
          </label>
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

        <Field
          label={
            isCorrect
              ? "Venue photo (optional — only needed if you want to update the current photo)"
              : "Venue photo"
          }
          htmlFor="venuePhoto"
          error={imageError}
          hint="This will appear on the venue's directory card. JPG or PNG, at least 800px wide recommended."
        >
          <input
            id="venuePhoto"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-[#E8E0D0]/15 file:px-3 file:py-1 file:text-sm file:text-[#E8E0D0]`}
          />
          {previewUrl && (
            <div className="relative mt-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected venue photo preview"
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
                  alt="Current venue photo"
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
