"use client";

import { useMemo, useState } from "react";
import type { Venue } from "@/lib/venueUtils";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

// Admin venue management: archive/unarchive (hide) venues from the public
// directory. Reversible — no hard delete (a venue's shows reference it by name,
// not FK, so a delete wouldn't clean them up anyway). Session-gated admin route
// does the real permission check; this UI is presentation.
export default function AllVenuesPanel({ venues }: { venues: Venue[] }) {
  const [items, setItems] = useState(venues);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const hiddenCount = useMemo(() => items.filter((v) => v.hidden).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((v) => {
      if (!showHidden && v.hidden) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.neighborhood.toLowerCase().includes(q)
      );
    });
  }, [items, query, showHidden]);

  async function toggleHidden(venue: Venue) {
    const hidden = !venue.hidden;
    setBusy(venue.slug);
    try {
      const res = await fetch(`/api/admin/venues/${encodeURIComponent(venue.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const data = await res.json();
      if (!data.success) {
        window.alert(data.error || (hidden ? "Hide failed" : "Unhide failed"));
        return;
      }
      setItems((prev) => prev.map((v) => (v.slug === venue.slug ? { ...v, hidden } : v)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight">All Venues</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          {items.length} venue{items.length === 1 ? "" : "s"} total
          {query && ` — ${filtered.length} matching`}
        </p>
      </header>

      <input
        className={`${INPUT} mb-3`}
        placeholder="Search by name, city, or neighborhood…"
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

      {filtered.length === 0 && <p className="text-sm text-[#E8E0D0]/55">No venues match.</p>}

      <div className="space-y-3">
        {filtered.map((venue) => (
          <div key={venue.slug} className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[#E8E0D0]">{venue.name}</p>
                <p className="mt-0.5 text-xs text-[#E8E0D0]/55">
                  {[venue.neighborhood, venue.city].filter(Boolean).join(", ") || "—"}
                </p>
                {venue.hidden && (
                  <p className="mt-2 inline-block rounded bg-[#E8E0D0]/15 px-2 py-0.5 text-xs text-[#E8E0D0]/80">
                    Archived — hidden from public
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a href={`/venues/${venue.slug}`} className={BTN} target="_blank" rel="noreferrer">
                  View
                </a>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => toggleHidden(venue)}
                  disabled={busy === venue.slug}
                >
                  {venue.hidden ? "Unhide" : "Hide"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
