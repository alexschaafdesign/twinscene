"use client";

import { useMemo, useState } from "react";
import type { MusicianEntry } from "@/lib/musicians";

type ClaimState = { slug: string; status: "pending" | "error"; message?: string };

// "Are you a musician?" entry point (/profile/musician). Search existing
// musicians to claim ("This is me" → admin-reviewed) or self-serve create a
// brand-new musician identity if not listed. Claiming grants band_editors
// access once approved (lib/musicianClaims.ts); creating grants nothing —
// see AGENTS task Slice 2 model recap.
export default function MusicianLinkSearch({ musicians }: { musicians: MusicianEntry[] }) {
  const [query, setQuery] = useState("");
  const [claimState, setClaimState] = useState<ClaimState | null>(null);

  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [nameMatch, setNameMatch] = useState<{ name: string; slug: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return musicians
      .filter((m) => {
        const haystack = [m.name, ...m.bands.map((b) => b.name)].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 20);
  }, [musicians, query]);

  async function claim(slug: string) {
    setClaimState({ slug, status: "pending" });
    try {
      const res = await fetch(`/api/musicians/${slug}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setClaimState({ slug, status: "error", message: data.error || "Something went wrong" });
        return;
      }
      setClaimState({ slug, status: "pending", message: "Claim submitted — awaiting admin review." });
    } catch {
      setClaimState({ slug, status: "error", message: "Something went wrong" });
    }
  }

  async function createMusician(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setCreateError("");
    setNameMatch(null);
    try {
      const res = await fetch("/api/musicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (data.matched) {
        setNameMatch({ name: data.musician.name, slug: data.musician.slug });
        return;
      }
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Something went wrong");
        return;
      }
      setCreatedName(data.musician.name);
    } catch {
      setCreateError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdName) {
    return (
      <p className="mt-6 text-sm text-[#E8E0D0]/80">
        Created your musician profile as <strong>{createdName}</strong>.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search musicians by name…"
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        {query.trim() && (
          <ul className="mt-3 flex flex-col gap-2">
            {filtered.length === 0 && (
              <li className="text-sm text-[#E8E0D0]/50">No musicians match that search.</li>
            )}
            {filtered.map((m) => {
              const state = claimState?.slug === m.slug ? claimState : null;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
                >
                  <span>
                    {m.name}
                    {m.bands.length > 0 && (
                      <span className="text-[#E8E0D0]/50"> — {m.bands.map((b) => b.name).join(", ")}</span>
                    )}
                  </span>
                  {state?.message ? (
                    <span
                      className={state.status === "error" ? "text-xs text-[#F5A3A3]" : "text-xs text-[#E8E0D0]/60"}
                    >
                      {state.message}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => claim(m.slug)}
                      className="shrink-0 text-[#E8E0D0]/80 hover:underline"
                    >
                      This is me
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[#E8E0D0]/15 pt-6">
        <h2 className="text-sm font-medium text-[#E8E0D0]">I&apos;m not listed</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Create your own musician profile. This doesn&apos;t attach you to any
          band — a band editor can add you as a member from their band&apos;s
          edit page.
        </p>
        <form onSubmit={createMusician} className="mt-3 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md border border-[#E8E0D0]/25 px-3.5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:opacity-40"
          >
            Create
          </button>
        </form>
        {nameMatch && (
          <p className="mt-2 text-sm text-[#E8E0D0]/70">
            An existing musician named <strong>{nameMatch.name}</strong> already
            matches this name —{" "}
            <button type="button" onClick={() => claim(nameMatch.slug)} className="underline hover:text-[#E8E0D0]">
              claim it instead?
            </button>
          </p>
        )}
        {createError && <p className="mt-2 text-sm text-[#F5A3A3]">{createError}</p>}
      </div>
    </div>
  );
}
