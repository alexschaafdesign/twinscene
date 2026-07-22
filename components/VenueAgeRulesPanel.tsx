"use client";

import { useMemo, useState } from "react";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

const RESTRICTIONS = ["21+", "18+", "All Ages"] as const;

export type VenueAgeRuleItem = {
  venueName: string;
  restriction: string; // "" = no rule
  appliesAfter: string; // "HH:MM" or "" = applies to every show
};

// Local editable state per venue: what's saved plus the in-flight edit.
type Row = VenueAgeRuleItem & {
  savedRestriction: string;
  savedAppliesAfter: string;
};

// Admin: blanket age policies per venue (venue_age_rules, migration 0056). Each
// row sets a restriction and an optional "only after" start time; the rule tags
// matching shows as they're scraped. "Apply to existing shows" backfills rows
// already in the DB (fill-only — never overwrites an existing value). The
// session-gated API does the real permission check; this UI is presentation.
export default function VenueAgeRulesPanel({
  venues,
  rules,
}: {
  venues: string[];
  rules: VenueAgeRuleItem[];
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const [rows, setRows] = useState<Row[]>(() => {
    const byName = new Map(rules.map((r) => [r.venueName, r]));
    return venues.map((name) => {
      const r = byName.get(name);
      return {
        venueName: name,
        restriction: r?.restriction ?? "",
        appliesAfter: r?.appliesAfter ?? "",
        savedRestriction: r?.restriction ?? "",
        savedAppliesAfter: r?.appliesAfter ?? "",
      };
    });
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.venueName.toLowerCase().includes(q));
  }, [rows, query]);

  const activeCount = useMemo(
    () => rows.filter((r) => r.savedRestriction).length,
    [rows],
  );

  function patch(name: string, next: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.venueName === name ? { ...r, ...next } : r)),
    );
  }

  const isDirty = (r: Row) =>
    r.restriction !== r.savedRestriction ||
    (r.restriction !== "" && r.appliesAfter !== r.savedAppliesAfter);

  async function save(r: Row) {
    setBusy(r.venueName);
    setMsg((m) => ({ ...m, [r.venueName]: "" }));
    try {
      const res = await fetch("/api/admin/venue-age-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueName: r.venueName,
          restriction: r.restriction,
          appliesAfter: r.restriction ? r.appliesAfter : "",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setMsg((m) => ({ ...m, [r.venueName]: data.error || "Save failed" }));
        return;
      }
      // A cleared rule ("none") drops the after-time too.
      const savedAfter = r.restriction ? r.appliesAfter : "";
      patch(r.venueName, {
        appliesAfter: savedAfter,
        savedRestriction: r.restriction,
        savedAppliesAfter: savedAfter,
      });
      setMsg((m) => ({ ...m, [r.venueName]: "Saved" }));
    } finally {
      setBusy(null);
    }
  }

  async function backfill(r: Row) {
    setBusy(r.venueName);
    setMsg((m) => ({ ...m, [r.venueName]: "" }));
    try {
      const res = await fetch("/api/admin/venue-age-rules/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueName: r.venueName }),
      });
      const data = await res.json();
      if (!data.success) {
        setMsg((m) => ({ ...m, [r.venueName]: data.error || "Backfill failed" }));
        return;
      }
      setMsg((m) => ({
        ...m,
        [r.venueName]: `Tagged ${data.updated} existing show${data.updated === 1 ? "" : "s"}`,
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${CARD} mb-8`}>
      <header className="mb-1">
        <h2 className="text-lg font-medium tracking-tight">Age rules</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Blanket age restriction per venue, applied to shows as they&rsquo;re
          scraped. Add an &ldquo;after&rdquo; time to restrict only later shows
          (e.g. White Squirrel: 21+ after 8:00pm). {activeCount} rule
          {activeCount === 1 ? "" : "s"} set.
        </p>
      </header>

      <input
        className={`${INPUT} my-3 w-full`}
        placeholder="Filter venues…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="divide-y divide-[#E8E0D0]/10">
        {filtered.map((r) => {
          const dirty = isDirty(r);
          const note = msg[r.venueName];
          return (
            <li
              key={r.venueName}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.venueName}
              </span>

              <select
                className={INPUT}
                value={r.restriction}
                onChange={(e) => patch(r.venueName, { restriction: e.target.value })}
                aria-label={`Age restriction for ${r.venueName}`}
              >
                <option value="">No rule</option>
                {RESTRICTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-sm text-[#E8E0D0]/60">
                after
                <input
                  type="time"
                  className={`${INPUT} disabled:opacity-40`}
                  value={r.appliesAfter}
                  disabled={!r.restriction}
                  onChange={(e) => patch(r.venueName, { appliesAfter: e.target.value })}
                  aria-label={`Apply only after this time for ${r.venueName}`}
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  className={BTN}
                  disabled={!dirty || busy === r.venueName}
                  onClick={() => save(r)}
                >
                  Save
                </button>
                <button
                  className={BTN}
                  disabled={!r.savedRestriction || dirty || busy === r.venueName}
                  onClick={() => backfill(r)}
                  title={
                    dirty
                      ? "Save the rule first"
                      : "Tag existing shows that don't have an age yet"
                  }
                >
                  Apply to existing
                </button>
              </div>

              {note && (
                <span className="text-xs text-[#E8E0D0]/50 sm:w-32 sm:text-right">
                  {note}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
