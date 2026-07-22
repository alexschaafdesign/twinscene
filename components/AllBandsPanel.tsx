"use client";

import { useMemo, useState } from "react";
import type { Band } from "@/lib/fetchBands";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

// Admin band management: archive/unarchive (hide) bands from the public
// directory. Reversible — no hard delete (a band's slug is embedded in show
// lineup JSON and videos.band_id has no cascade, so a delete would dangle
// references). Session-gated admin route does the real permission check.
export default function AllBandsPanel({ bands }: { bands: Band[] }) {
  const [items, setItems] = useState(bands);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const hiddenCount = useMemo(() => items.filter((b) => b.hidden).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((b) => {
      if (!showHidden && b.hidden) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.genres.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [items, query, showHidden]);

  async function toggleHidden(band: Band) {
    const hidden = !band.hidden;
    setBusy(band.slug);
    try {
      const res = await fetch(`/api/admin/bands/${encodeURIComponent(band.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const data = await res.json();
      if (!data.success) {
        window.alert(data.error || (hidden ? "Hide failed" : "Unhide failed"));
        return;
      }
      setItems((prev) => prev.map((b) => (b.slug === band.slug ? { ...b, hidden } : b)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight">All Bands</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          {items.length} band{items.length === 1 ? "" : "s"} total
          {query && ` — ${filtered.length} matching`}
        </p>
      </header>

      <input
        className={`${INPUT} mb-3`}
        placeholder="Search by name, city, or genre…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="mb-8 flex items-center gap-2 text-sm text-[#E8E0D0]/60">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => setShowHidden(e.target.checked)}
        />
        Show archived ({hiddenCount})
      </label>

      {filtered.length === 0 && <p className="text-sm text-[#E8E0D0]/55">No bands match.</p>}

      <div className="space-y-3">
        {filtered.map((band) => (
          <div key={band.slug} className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[#E8E0D0]">{band.name}</p>
                <p className="mt-0.5 text-xs text-[#E8E0D0]/55">
                  {[band.genres.join(", "), band.city].filter(Boolean).join(" · ") || "—"}
                </p>
                {band.hidden && (
                  <p className="mt-2 inline-block rounded bg-[#E8E0D0]/15 px-2 py-0.5 text-xs text-[#E8E0D0]/80">
                    Archived — hidden from public
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a href={`/bands/${band.slug}`} className={BTN} target="_blank" rel="noreferrer">
                  View
                </a>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => toggleHidden(band)}
                  disabled={busy === band.slug}
                >
                  {band.hidden ? "Unhide" : "Hide"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
