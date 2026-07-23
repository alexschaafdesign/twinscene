"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BandMultiSelect, { type BandOption } from "@/components/BandMultiSelect";

// Admin create/edit form for an article. `mode: "add"` POSTs to
// /api/admin/articles; `mode: "edit"` PATCHes /api/admin/articles/[id].
// Leaving the hero image blank makes the server best-effort fetch og:image
// from the URL on save.
export interface ArticleFormValues {
  id?: number;
  writerId: number | "";
  url: string;
  title: string;
  publication: string;
  dek: string;
  pullQuote: string;
  heroImageUrl: string;
  publishedAt: string; // yyyy-mm-dd
  readingTime: string; // kept as string in the input
  featured: boolean;
  status: "draft" | "published";
  bandSlugs: string[]; // selected band slugs (cross-linked as "In the press")
}

export interface WriterOption {
  id: number;
  name: string;
}

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#E8E0D0]/40">{hint}</p>}
    </div>
  );
}

export default function ArticleForm({
  mode,
  writers,
  bands,
  initial,
}: {
  mode: "add" | "edit";
  writers: WriterOption[];
  bands: BandOption[];
  initial?: Partial<ArticleFormValues>;
}) {
  const router = useRouter();
  const [v, setV] = useState<ArticleFormValues>({
    writerId: initial?.writerId ?? "",
    url: initial?.url ?? "",
    title: initial?.title ?? "",
    publication: initial?.publication ?? "",
    dek: initial?.dek ?? "",
    pullQuote: initial?.pullQuote ?? "",
    heroImageUrl: initial?.heroImageUrl ?? "",
    publishedAt: initial?.publishedAt ?? "",
    readingTime: initial?.readingTime ?? "",
    featured: initial?.featured ?? false,
    status: initial?.status ?? "published",
    bandSlugs: initial?.bandSlugs ?? [],
  });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const set =
    (k: keyof ArticleFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const url = mode === "add" ? "/api/admin/articles" : `/api/admin/articles/${initial?.id}`;
    const method = mode === "add" ? "POST" : "PATCH";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writerId: v.writerId === "" ? undefined : Number(v.writerId),
          url: v.url,
          title: v.title,
          publication: v.publication,
          dek: v.dek,
          pullQuote: v.pullQuote,
          heroImageUrl: v.heroImageUrl,
          publishedAt: v.publishedAt || null,
          readingTime: v.readingTime ? Number(v.readingTime) : null,
          featured: v.featured,
          status: v.status,
          bandSlugs: v.bandSlugs.join(","),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      router.push("/admin/articles");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Writer">
        <select className={inputClass} value={v.writerId} onChange={set("writerId")} required>
          <option value="">Select a writer…</option>
          {writers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="URL" hint="Link to the original piece">
        <input className={inputClass} value={v.url} onChange={set("url")} placeholder="https://…" required />
      </Field>
      <Field label="Title">
        <input className={inputClass} value={v.title} onChange={set("title")} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Publication" hint="Where this piece ran">
          <input className={inputClass} value={v.publication} onChange={set("publication")} />
        </Field>
        <Field label="Published date">
          <input type="date" className={inputClass} value={v.publishedAt} onChange={set("publishedAt")} />
        </Field>
      </div>
      <Field label="Dek / summary">
        <textarea className={`${inputClass} min-h-16`} value={v.dek} onChange={set("dek")} />
      </Field>
      <Field label="Pull quote" hint="A short, hand-picked excerpt (kept brief — fair use)">
        <textarea className={`${inputClass} min-h-20`} value={v.pullQuote} onChange={set("pullQuote")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hero image URL" hint="Leave blank to auto-fetch og:image on save">
          <input className={inputClass} value={v.heroImageUrl} onChange={set("heroImageUrl")} placeholder="https://…" />
        </Field>
        <Field label="Reading time (min)">
          <input type="number" min={1} className={inputClass} value={v.readingTime} onChange={set("readingTime")} />
        </Field>
      </div>
      <Field label="Linked bands" hint="Type a band name to tag it — surfaces this piece as 'In the press' on that band's page">
        <BandMultiSelect
          bands={bands}
          value={v.bandSlugs}
          onChange={(slugs) => setV((prev) => ({ ...prev, bandSlugs: slugs }))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <select className={inputClass} value={v.status} onChange={set("status")}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-[#E8E0D0]/85">
          <input
            type="checkbox"
            checked={v.featured}
            onChange={(e) => setV((prev) => ({ ...prev, featured: e.target.checked }))}
            className="h-4 w-4 accent-[#E8E0D0]"
          />
          Feature at top of Reads
        </label>
      </div>

      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : mode === "add" ? "Create article" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
