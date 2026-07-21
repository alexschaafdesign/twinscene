"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReconcileEntry } from "@/lib/scrapers/reconcile";

function GenreChips({ genres, age }: { genres: string[]; age: string | null }) {
  if (genres.length === 0 && !age) {
    return <span className="text-xs text-[#E8E0D0]/35">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {genres.map((g) => (
        <span
          key={g}
          className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[11px] text-[#E8E0D0]/80"
        >
          {g}
        </span>
      ))}
      {age && (
        <span className="rounded bg-[#E8B84B]/15 px-1.5 py-0.5 text-[11px] text-[#E8B84B]">
          {age}
        </span>
      )}
    </span>
  );
}

/** Compact "Jul 22" — only worth showing for sources whose list spans more
 * than one night (Racket's week), but harmless to show for a same-day one
 * (Crawl Space) too. */
function formatDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bandsLabel(entry: ReconcileEntry): string {
  const bands = entry.allBands.join(", ");
  const date = formatDate(entry.date);
  const parts = [date, bands, entry.musicTime].filter(Boolean);
  return parts.join(" · ");
}

// Missing-show entries, keyed by their spot in the array (entries have no
// stable id of their own — they're re-parsed fresh off the source post on
// every page load, not stored anywhere).
type UnmatchedRow = ReconcileEntry & { _key: string };
type MatchedRow = ReconcileEntry & { _key: string };

export default function ReconcileManager({
  source,
  initialUnmatched,
  initialMatched,
}: {
  source: { id: string; name: string };
  initialUnmatched: ReconcileEntry[];
  initialMatched: ReconcileEntry[];
}) {
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>(
    initialUnmatched.map((e, i) => ({ ...e, _key: `${e.venue}-${i}` })),
  );
  const matched: MatchedRow[] = initialMatched.map((e, i) => ({
    ...e,
    _key: `${e.match!.id}-${i}`,
  }));
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [addedShowIds, setAddedShowIds] = useState<Record<string, string>>({});
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  function withPending(key: string, fn: () => Promise<void>) {
    setPending((prev) => new Set(prev).add(key));
    setError("");
    fn().finally(() => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  }

  async function accept(row: UnmatchedRow) {
    withPending(row._key, async () => {
      try {
        const res = await fetch("/api/admin/reconcile/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: source.id,
            venue: row.venue,
            date: row.date,
            headliner: row.headliner,
            allBands: row.allBands,
            musicTime: row.musicTime,
            ageRestriction: row.ageRestriction,
            genres: row.genres,
            sourceUrl: row.sourceUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || "Import failed");
          return;
        }
        if (data.id) setAddedShowIds((prev) => ({ ...prev, [row._key]: data.id }));
        setUnmatched((prev) => prev.filter((r) => r._key !== row._key));
      } catch {
        setError("Import failed");
      }
    });
  }

  function dismiss(key: string) {
    setUnmatched((prev) => prev.filter((r) => r._key !== key));
  }

  async function apply(row: MatchedRow) {
    withPending(row._key, async () => {
      try {
        const res = await fetch("/api/admin/reconcile/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.match!.id,
            genres: row.genres,
            ageRestriction: row.ageRestriction,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || "Apply failed");
          return;
        }
        setAppliedKeys((prev) => new Set(prev).add(row._key));
      } catch {
        setError("Apply failed");
      }
    });
  }

  return (
    <>
      {error && (
        <p className="mt-4 rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
          {error}
        </p>
      )}

      {/* Missing shows — the reconciliation signal. */}
      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          Missing from our list ({unmatched.length})
        </h2>
        {unmatched.length === 0 ? (
          <p className="mt-2 text-sm text-[#E8E0D0]/45">
            Nothing — we have everything {source.name} listed.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {unmatched.map((e) => {
              const addedId = addedShowIds[e._key];
              const busy = pending.has(e._key);
              return (
                <li
                  key={e._key}
                  className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#E8E0D0]">{e.venue}</p>
                      <p className="mt-0.5 text-sm text-[#E8E0D0]/70">{bandsLabel(e)}</p>
                      <div className="mt-1.5">
                        <GenreChips genres={e.genres} age={e.ageRestriction} />
                      </div>
                    </div>
                    {addedId ? (
                      <Link
                        href={`/shows/${addedId}`}
                        className="shrink-0 text-xs text-[#8FBF8F] hover:underline"
                      >
                        Added — view →
                      </Link>
                    ) : (
                      <div className="flex shrink-0 gap-3 text-xs">
                        <button
                          onClick={() => accept(e)}
                          disabled={busy}
                          className="text-[#8FBF8F] hover:underline disabled:opacity-40"
                        >
                          {busy ? "Adding…" : "Add show"}
                        </button>
                        <button
                          onClick={() => dismiss(e._key)}
                          disabled={busy}
                          className="text-[#E8E0D0]/50 hover:underline disabled:opacity-40"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Matched — genre/age suggestions the daily run fills in, when the
          source provides any (sources without genre/age, e.g. Racket, will
          never show an "Apply now" button here). */}
      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          Matched — genre/age suggestions ({matched.length})
        </h2>
        {matched.length === 0 ? (
          <p className="mt-2 text-sm text-[#E8E0D0]/45">No matches.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {matched.map((e) => {
              const alreadySet = e.match!.genres.length > 0;
              const nothingToApply = e.genres.length === 0 && !e.ageRestriction;
              const applied = appliedKeys.has(e._key);
              const busy = pending.has(e._key);
              return (
                <li
                  key={e._key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E8E0D0]/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/shows/${e.match!.id}`}
                      className="text-sm text-[#E8E0D0] hover:underline"
                    >
                      {e.match!.title}
                    </Link>
                    <span className="ml-2 text-xs text-[#E8E0D0]/50">{e.match!.venue}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <GenreChips genres={e.genres} age={e.ageRestriction} />
                    {applied ? (
                      <span className="text-[#8FBF8F]">applied</span>
                    ) : alreadySet ? (
                      <span className="text-[#E8E0D0]/35">already set</span>
                    ) : nothingToApply ? null : (
                      <button
                        onClick={() => apply(e)}
                        disabled={busy}
                        className="text-[#8FBF8F] hover:underline disabled:opacity-40"
                      >
                        {busy ? "Applying…" : "Apply now"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
