"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClaimOwnershipInstructions } from "./ClaimOwnershipButton";

export interface BandSearchEntry {
  name: string;
  slug: string;
}

// Once a band is found or just created, this replaces the whole search/
// quick-add UI — the result pane shows claim instructions for that one band.
type Resolved = { name: string; slug: string; justCreated: boolean };

// "Do you have a band?" entry point (/profile/band, and onboarding's band
// step). Search the existing band directory, or quick-add a brand-new band
// by name if it's not listed. Either way, creating/finding a band grants NO
// edit rights by itself — same trust model as the public /submit form and
// /bands/[slug]'s "Claim this band" button (components/ClaimOwnershipButton.tsx):
// ownership always requires the Instagram-DM-verified one-time code at
// /redeem. This never bypasses that.
export default function BandLinkSearch({
  bands,
  next,
}: {
  bands: BandSearchEntry[];
  next?: string;
}) {
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bands.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 20);
  }, [bands, query]);

  function select(band: BandSearchEntry) {
    setQuery("");
    setResolved({ ...band, justCreated: false });
  }

  async function createBand(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setCreateError("");
    try {
      const form = new FormData();
      form.set("mode", "add");
      form.set("bandName", trimmed);
      const res = await fetch("/api/bands/submit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Something went wrong");
        return;
      }
      setResolved({ name: trimmed, slug: data.slug, justCreated: true });
    } catch {
      setCreateError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (resolved) {
    return (
      <div className="mt-6 rounded-md border border-[#E8E0D0]/15 px-3.5 py-3">
        <p className="text-sm text-[#E8E0D0]">
          {resolved.justCreated ? (
            <>
              Added <strong>{resolved.name}</strong> to the directory.
            </>
          ) : (
            <>
              Found <strong>{resolved.name}</strong>.
            </>
          )}{" "}
          <Link
            href={`/bands/${resolved.slug}`}
            className="underline underline-offset-2 hover:text-[#E8E0D0]"
          >
            View the band&apos;s page
          </Link>
          .
        </p>
        <ClaimOwnershipInstructions loggedIn />
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setResolved(null)}
            className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
          >
            {resolved.justCreated ? "Add a different band" : "Search again"}
          </button>
          {next && (
            <Link
              href={next}
              className="text-sm font-medium text-[#E8E0D0] underline underline-offset-2 hover:text-[#E8B84B]"
            >
              Continue
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bands by name…"
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        {query.trim() && (
          <ul className="mt-3 flex flex-col gap-2">
            {filtered.length === 0 && (
              <li className="text-sm text-[#E8E0D0]/50">No bands match that search.</li>
            )}
            {filtered.map((b) => (
              <li key={b.slug}>
                <button
                  type="button"
                  onClick={() => select(b)}
                  className="flex w-full items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-left text-sm transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/5"
                >
                  <span>{b.name}</span>
                  <span className="shrink-0 text-[#E8E0D0]/80">This is my band</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[#E8E0D0]/15 pt-6">
        <h2 className="text-sm font-medium text-[#E8E0D0]">Not listed yet</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Add your band to the directory now — a name is all you need to
          start. You can fill in genres, photo, bio, and links later from the
          band&apos;s own page, once you&apos;ve claimed it.
        </p>
        <form onSubmit={createBand} className="mt-3 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Band name"
            className="flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md border border-[#E8E0D0]/25 px-3.5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:opacity-40"
          >
            Add
          </button>
        </form>
        {createError && <p className="mt-2 text-sm text-[#F5A3A3]">{createError}</p>}
      </div>

      {next && (
        <Link
          href={next}
          className="self-start text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
        >
          Skip for now
        </Link>
      )}
    </div>
  );
}
