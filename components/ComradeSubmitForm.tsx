"use client";

import Link from "next/link";
import { useState } from "react";
import { slugify, COMRADE_CATEGORIES, comradeCategoryLabel, type ComradeCategory } from "@/lib/comradeUtils";
import { resizeImageFile } from "@/lib/resizeImage";

// Shared input styling, kept in sync with SubmitForm.tsx.
const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

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

// Combined budget for photo + gallery files in one request, mirroring
// app/api/comrades/submit/route.ts's MAX_UPLOAD_BYTES — checked here too so an
// over-budget upload is caught before it ever makes a round trip.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export default function ComradeSubmitForm({
  mode = "add",
  initialSlug = "",
  initialName = "",
  initialCategory = "other",
  initialTagline = "",
  initialCity = "",
  initialBio = "",
  initialWebsite = "",
  initialInstagram = "",
  initialContact = "",
  initialPortfolioUrl = "",
  initialPhotoUrl = "",
  initialGallery = [],
}: {
  mode?: Mode;
  initialSlug?: string;
  initialName?: string;
  initialCategory?: string;
  initialTagline?: string;
  initialCity?: string;
  initialBio?: string;
  initialWebsite?: string;
  initialInstagram?: string;
  initialContact?: string;
  initialPortfolioUrl?: string;
  initialPhotoUrl?: string;
  initialGallery?: string[];
}) {
  const isCorrect = mode === "correct";

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<ComradeCategory>(
    COMRADE_CATEGORIES.includes(initialCategory as ComradeCategory)
      ? (initialCategory as ComradeCategory)
      : "other",
  );
  const [tagline, setTagline] = useState(initialTagline);
  const [city, setCity] = useState(initialCity);
  const [bio, setBio] = useState(initialBio);
  const [website, setWebsite] = useState(initialWebsite);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [contact, setContact] = useState(initialContact);
  const [portfolioUrl, setPortfolioUrl] = useState(initialPortfolioUrl);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(initialPhotoUrl);
  const [removePhoto, setRemovePhoto] = useState(false);

  // Gallery only surfaces for the photo/video category (a portfolio of work
  // samples) — studios/labels/etc just have the single profile photo.
  const isPhotoVideo = category === "photo_video";
  const [existingGallery, setExistingGallery] = useState<string[]>(initialGallery);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const gallerySlotsLeft = MAX_GALLERY_IMAGES - existingGallery.length - galleryFiles.length;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [submittedSlug, setSubmittedSlug] = useState("");

  const heading = isCorrect ? "Edit this listing" : "Add a comrade";
  const subhead = isCorrect
    ? "Update the listing below."
    : "List a studio, label, photographer, or other scene fixture that isn't a band or musician — bands can find and credit them.";

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const input = e.target;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setErrors((prev) => ({ ...prev, photo: "Unsupported image type — use JPEG, PNG, WebP, or GIF" }));
      input.value = "";
      return;
    }

    const galleryBytes = galleryFiles.reduce((sum, f) => sum + f.size, 0);
    const resized = file.size + galleryBytes > MAX_UPLOAD_BYTES ? await resizeImageFile(file) : file;
    if (resized.size + galleryBytes > MAX_UPLOAD_BYTES) {
      setErrors((prev) => ({
        ...prev,
        photo: "That photo is still too large for this upload — try a smaller file or fewer gallery images (4MB combined limit)",
      }));
      input.value = "";
      return;
    }

    setErrors((prev) => {
      if (!("photo" in prev)) return prev;
      const rest = { ...prev };
      delete rest.photo;
      return rest;
    });
    setPhotoFile(resized);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(resized));
  }

  async function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const input = e.target;
    input.value = ""; // allow re-picking the same file after a remove
    if (picked.length === 0) return;

    let runningBytes = (photoFile?.size ?? 0) + galleryFiles.reduce((sum, f) => sum + f.size, 0);
    const accepted: File[] = [];
    let skippedType = false;
    let skippedBudget = false;

    for (const file of picked.slice(0, gallerySlotsLeft)) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        skippedType = true;
        continue;
      }
      const candidate = runningBytes + file.size > MAX_UPLOAD_BYTES ? await resizeImageFile(file) : file;
      if (runningBytes + candidate.size > MAX_UPLOAD_BYTES) {
        skippedBudget = true;
        continue;
      }
      runningBytes += candidate.size;
      accepted.push(candidate);
    }

    if (accepted.length > 0) {
      setGalleryFiles((prev) => [...prev, ...accepted]);
      setGalleryPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    }

    if (skippedType) {
      setErrors((prev) => ({ ...prev, gallery: "Unsupported image type — use JPEG, PNG, WebP, or GIF" }));
    } else if (skippedBudget) {
      setErrors((prev) => ({
        ...prev,
        gallery: "Some images were skipped — combined upload size is limited to 4MB",
      }));
    } else {
      setErrors((prev) => {
        if (!("gallery" in prev)) return prev;
        const rest = { ...prev };
        delete rest.gallery;
        return rest;
      });
    }
  }

  function removeExistingGalleryImage(url: string) {
    setExistingGallery((prev) => prev.filter((u) => u !== url));
  }

  function removeNewGalleryImage(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
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
      const targetSlug = isCorrect && initialSlug ? initialSlug : slugify(name.trim());

      const payload = new FormData();
      payload.set("mode", mode);
      payload.set("existingSlug", isCorrect ? initialSlug : "");
      payload.set("slug", targetSlug);
      payload.set("name", name.trim());
      payload.set("category", category);
      payload.set("tagline", tagline.trim());
      payload.set("city", city.trim());
      payload.set("bio", bio.trim());
      payload.set("website", website.trim());
      payload.set("instagram", instagram.trim());
      payload.set("contact", contact.trim());
      // Portfolio + gallery only apply to photo/video listings; send empties
      // otherwise so the route clears any stray values.
      payload.set("portfolioUrl", isPhotoVideo ? portfolioUrl.trim() : "");
      payload.set("existingGallery", JSON.stringify(isPhotoVideo ? existingGallery : []));
      if (isPhotoVideo) galleryFiles.forEach((file) => payload.append("galleryPhotos", file));
      payload.set("removePhoto", removePhoto ? "true" : "false");
      if (photoFile) payload.set("photo", photoFile);

      const res = await fetch("/api/comrades/submit", { method: "POST", body: payload });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const message =
          data?.error ||
          (res.status === 413
            ? "That upload is too large — try smaller images or fewer gallery photos"
            : "Submission failed. Please try again.");
        throw new Error(message);
      }
      setSubmittedSlug(typeof data.slug === "string" ? data.slug : targetSlug);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    const href = submittedSlug ? `/comrades/${submittedSlug}` : "/comrades";
    return (
      <div className="rounded-lg border border-[#E8E0D0]/15 p-8 text-center">
        <h2 className="text-xl font-medium">
          {isCorrect ? "Thanks for the updates!" : "You're listed!"}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#E8E0D0]/75">
          {isCorrect
            ? "If the changes don't appear immediately, give it a minute or so."
            : "Log in and claim your listing from its page to get edit access."}
        </p>
        <Link
          href={href}
          className="mt-6 inline-block rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          {submittedSlug ? `View listing →` : "← Comrades"}
        </Link>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{heading}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#E8E0D0]/70">{subhead}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="Name" htmlFor="name" required error={errors.name}>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Suede Studio"
            className={inputClass}
          />
        </Field>

        <Field label="Category" htmlFor="category">
          <div className="flex flex-wrap gap-2">
            {COMRADE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  category === c
                    ? "border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]"
                    : "border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60"
                }`}
              >
                {comradeCategoryLabel(c)}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Tagline"
          htmlFor="tagline"
          hint="One line for the directory card — what they actually do."
        >
          <input
            id="tagline"
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. In-session video captures for local bands"
            maxLength={140}
            className={inputClass}
          />
        </Field>

        <Field label="Photo" htmlFor="photo" hint="Logo or photo. Square works best." error={errors.photo}>
          <div className="flex items-center gap-3">
            {photoPreview && !removePhoto && (
              // eslint-disable-next-line @next/next/no-img-element -- local preview / R2 URL
              <img
                src={photoPreview}
                alt=""
                className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-[#E8E0D0]/15"
              />
            )}
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded-md file:border file:border-[#E8E0D0]/25 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0] hover:file:border-[#E8E0D0]/50"
            />
          </div>
          {isCorrect && photoPreview && !removePhoto && (
            <button
              type="button"
              onClick={() => {
                setRemovePhoto(true);
                setPhotoFile(null);
                setPhotoPreview("");
              }}
              className="mt-2 text-xs text-[#E8E0D0]/50 underline underline-offset-2 hover:text-[#E8E0D0]"
            >
              Remove photo
            </button>
          )}
        </Field>

        {/* Portfolio gallery — photo/video listings only. */}
        {isPhotoVideo && (
          <Field
            label="Gallery"
            htmlFor="gallery"
            hint={
              gallerySlotsLeft > 0
                ? `Up to ${MAX_GALLERY_IMAGES} high-quality work samples. ${gallerySlotsLeft} left.`
                : `Up to ${MAX_GALLERY_IMAGES} high-quality work samples — remove one to add another.`
            }
            error={errors.gallery}
          >
            {(existingGallery.length > 0 || galleryPreviews.length > 0) && (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {existingGallery.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-[#E8E0D0]/15">
                    {/* eslint-disable-next-line @next/next/no-img-element -- R2 URL */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeExistingGalleryImage(url)}
                      className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-[#E8E0D0] opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {galleryPreviews.map((url, i) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-[#E8E0D0]/15">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNewGalleryImage(i)}
                      className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-[#E8E0D0] opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {gallerySlotsLeft > 0 && (
              <input
                id="gallery"
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryChange}
                className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded-md file:border file:border-[#E8E0D0]/25 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0] hover:file:border-[#E8E0D0]/50"
              />
            )}
          </Field>
        )}

        <Field label="City" htmlFor="city">
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Minneapolis"
            className={inputClass}
          />
        </Field>

        <Field label="Bio" htmlFor="bio">
          <textarea
            id="bio"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What they do, how long they've been at it, what makes them worth knowing."
            className={inputClass}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Website" htmlFor="website">
            <input
              id="website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Instagram" htmlFor="instagram" hint="@handle or full URL">
            <input
              id="instagram"
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {isPhotoVideo && (
          <Field label="Portfolio" htmlFor="portfolioUrl" hint="Link to a fuller body of work, if you have one.">
            <input
              id="portfolioUrl"
              type="text"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Contact" htmlFor="contact" hint="Booking email or phone — shown publicly on the profile.">
          <input
            id="contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
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
          {submitting ? "Submitting…" : isCorrect ? "Save changes" : "Add listing"}
        </button>
      </form>
    </div>
  );
}
