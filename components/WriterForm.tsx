"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin create/edit form for a writer profile. `mode: "add"` POSTs to
// /api/admin/writers; `mode: "edit"` PATCHes /api/admin/writers/[slug]. Photo
// is entered as a URL for v1 (no R2 upload widget yet — that's the public
// self-add slice).
export interface WriterFormValues {
  slug?: string;
  name: string;
  publication: string;
  city: string;
  bio: string;
  website: string;
  substackUrl: string;
  instagram: string;
  twitter: string;
  contact: string;
  photoUrl: string;
}

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#E8E0D0]/40">{hint}</p>}
    </div>
  );
}

export default function WriterForm({
  mode,
  initial,
}: {
  mode: "add" | "edit";
  initial?: Partial<WriterFormValues>;
}) {
  const router = useRouter();
  const [v, setV] = useState<WriterFormValues>({
    name: initial?.name ?? "",
    publication: initial?.publication ?? "",
    city: initial?.city ?? "",
    bio: initial?.bio ?? "",
    website: initial?.website ?? "",
    substackUrl: initial?.substackUrl ?? "",
    instagram: initial?.instagram ?? "",
    twitter: initial?.twitter ?? "",
    contact: initial?.contact ?? "",
    photoUrl: initial?.photoUrl ?? "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const set = (k: keyof WriterFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const url = mode === "add" ? "/api/admin/writers" : `/api/admin/writers/${initial?.slug}`;
    const method = mode === "add" ? "POST" : "PATCH";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      router.push(`/writers/${data.writer.slug}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <input className={inputClass} value={v.name} onChange={set("name")} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Publication" hint="Their main outlet, e.g. Racket">
          <input className={inputClass} value={v.publication} onChange={set("publication")} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={v.city} onChange={set("city")} />
        </Field>
      </div>
      <Field label="Bio">
        <textarea className={`${inputClass} min-h-24`} value={v.bio} onChange={set("bio")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input className={inputClass} value={v.website} onChange={set("website")} placeholder="https://…" />
        </Field>
        <Field label="Substack / feed URL" hint="Used later for auto-ingest">
          <input className={inputClass} value={v.substackUrl} onChange={set("substackUrl")} placeholder="https://…" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instagram">
          <input className={inputClass} value={v.instagram} onChange={set("instagram")} placeholder="@handle" />
        </Field>
        <Field label="X / Twitter">
          <input className={inputClass} value={v.twitter} onChange={set("twitter")} placeholder="@handle" />
        </Field>
      </div>
      <Field label="Contact" hint="Email or note, shown only if set">
        <input className={inputClass} value={v.contact} onChange={set("contact")} />
      </Field>
      <Field label="Photo URL" hint="Headshot / avatar (upload widget coming later)">
        <input className={inputClass} value={v.photoUrl} onChange={set("photoUrl")} placeholder="https://…" />
      </Field>

      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : mode === "add" ? "Create writer" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
