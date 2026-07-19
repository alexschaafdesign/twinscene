"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resizeImageFile } from "@/lib/resizeImage";

const MAX_BIO_LENGTH = 280;
// Mirrors app/api/musicians/[slug]/avatar/route.ts's MAX_UPLOAD_BYTES/ALLOWED_TYPES —
// checked here too so an oversized file never has to make a round trip just
// to be rejected (a large enough upload gets killed by Vercel's own
// request-body cap before our route handler runs, which comes back as a
// non-JSON response we can't extract a message from).
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface MusicianEditData {
  name: string;
  bio: string | null;
  image_url: string | null;
}

/** Edit form for app/m/[slug]/edit — name, bio, and an avatar file picker
 * with a live preview. Mirrors ProfileEditForm's split-request shape: the
 * avatar (multipart, to /api/musicians/<slug>/avatar) and the name/bio save
 * (JSON PATCH to /api/musicians/<slug>) are separate requests behind one
 * Save button. Slug is never editable here — it's the URL. */
export default function MusicianEditForm({ slug, musician }: { slug: string; musician: MusicianEditData }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(musician.name);
  const [bio, setBio] = useState(musician.bio ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(musician.image_url);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [fieldError, setFieldError] = useState<{ name?: string; bio?: string; avatar?: string; general?: string }>(
    {},
  );

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setFieldError((prev) => ({ ...prev, avatar: "Unsupported image type — use JPEG, PNG, WebP, or GIF" }));
      input.value = "";
      return;
    }

    const resized = file.size > MAX_AVATAR_BYTES ? await resizeImageFile(file, { maxDimension: 1200 }) : file;
    if (resized.size > MAX_AVATAR_BYTES) {
      const mb = (resized.size / (1024 * 1024)).toFixed(1);
      setFieldError((prev) => ({ ...prev, avatar: `That image is still ${mb}MB after downsizing — try a smaller file` }));
      input.value = "";
      return;
    }

    setFieldError((prev) => ({ ...prev, avatar: undefined }));
    setAvatarFile(resized);
    setAvatarPreview(URL.createObjectURL(resized));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setFieldError({});

    try {
      if (avatarFile) {
        const form = new FormData();
        form.append("avatar", avatarFile);
        const res = await fetch(`/api/musicians/${slug}/avatar`, { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          const message =
            data?.error ||
            (res.status === 413
              ? "That image is too large — please use a file under 4MB"
              : "Couldn't upload that image. Try a different file, or try again in a moment.");
          setFieldError({ avatar: message });
          setStatus("error");
          return;
        }
      }

      const res = await fetch(`/api/musicians/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        if (res.status === 400 && data?.error?.toLowerCase().includes("name")) {
          setFieldError({ name: data?.error });
        } else if (res.status === 400) {
          setFieldError({ bio: data?.error });
        } else {
          setFieldError({ general: data?.error || "Couldn't save this musician" });
        }
        setStatus("error");
        return;
      }

      setStatus("saved");
      setAvatarFile(null);
      router.refresh();
    } catch {
      setFieldError({ general: "Couldn't reach the server. Check your connection and try again." });
      setStatus("error");
    }
  }

  const initial = (name.trim()[0] || "?").toUpperCase();
  const bioRemaining = MAX_BIO_LENGTH - bio.length;

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6" noValidate>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Change avatar"
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-lg font-medium text-[#E8E0D0] transition hover:border-[#E8E0D0]/50"
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </button>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="self-start text-sm text-[#E8E0D0]/80 underline underline-offset-2 transition hover:text-[#E8E0D0]"
          >
            Change photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarChange}
            className="sr-only"
          />
          {fieldError.avatar && <p className="text-sm text-[#F5A3A3]">{fieldError.avatar}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="musician-name" className="text-sm text-[#E8E0D0]/80">
          Name
        </label>
        <input
          id="musician-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-invalid={!!fieldError.name}
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <p className="text-xs text-[#E8E0D0]/50">Your page&apos;s URL doesn&apos;t change when you rename yourself.</p>
        {fieldError.name && <p className="text-sm text-[#F5A3A3]">{fieldError.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="musician-bio" className="text-sm text-[#E8E0D0]/80">
          Bio
        </label>
        <textarea
          id="musician-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
          rows={4}
          maxLength={MAX_BIO_LENGTH}
          className="w-full resize-none rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <p className={`text-xs ${bioRemaining < 0 ? "text-[#F5A3A3]" : "text-[#E8E0D0]/50"}`}>
          {bioRemaining} characters left
        </p>
        {fieldError.bio && <p className="text-sm text-[#F5A3A3]">{fieldError.bio}</p>}
      </div>

      {fieldError.general && <p className="text-sm text-[#F5A3A3]">{fieldError.general}</p>}
      {status === "saved" && <p className="text-sm text-[#9FD3A0]">Saved.</p>}

      <button
        type="submit"
        disabled={status === "saving"}
        className="self-start rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
