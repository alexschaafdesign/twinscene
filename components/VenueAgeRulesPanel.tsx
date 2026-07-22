"use client";

import { useMemo, useState } from "react";
import { formatShowTime } from "@/lib/showTime";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

// Quick-pick suggestions offered via a datalist — not a fixed set. The field is
// freeform, so a venue can carry a full note ("All ages (under 18 with an
// adult)") that becomes the show's age label verbatim.
const RESTRICTION_PRESETS = ["21+", "18+", "All Ages"] as const;

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

type Note = { text: string; kind: "ok" | "err" };

/** The committed rule as a one-line human summary, e.g. "21+ · after 8:00pm". */
function ruleSummary(restriction: string, appliesAfter: string): string {
  if (!restriction) return "";
  const after = appliesAfter ? formatShowTime(appliesAfter) : null;
  return after ? `${restriction} · after ${after}` : restriction;
}

// Admin: blanket age policies per venue (venue_age_rules, migration 0056). Each
// row shows the venue's currently-saved rule as a badge, then lets you edit it;
// the rule tags matching shows as they're scraped. "Apply to existing" backfills
// rows already in the DB (fill-only — never overwrites an existing value). The
// session-gated API does the real permission check; this UI is presentation.
export default function VenueAgeRulesPanel({
  venues,
  rules,
}: {
  venues: string[];
  rules: VenueAgeRuleItem[];
}) {
  const [query, setQuery] = useState("");
  const [onlyWithRules, setOnlyWithRules] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});

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

  const activeCount = useMemo(
    () => rows.filter((r) => r.savedRestriction).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyWithRules && !r.savedRestriction) return false;
      if (q && !r.venueName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, onlyWithRules]);

  function patch(name: string, next: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.venueName === name ? { ...r, ...next } : r)),
    );
  }

  // A user edit — patch the field and clear any stale status note for the row.
  function edit(name: string, next: Partial<Row>) {
    patch(name, next);
    setNotes((m) => {
      if (!m[name]) return m;
      const { [name]: _drop, ...rest } = m;
      return rest;
    });
  }

  function setNote(name: string, text: string, kind: Note["kind"]) {
    setNotes((m) => ({ ...m, [name]: { text, kind } }));
  }

  const isDirty = (r: Row) =>
    r.restriction !== r.savedRestriction ||
    (r.restriction !== "" && r.appliesAfter !== r.savedAppliesAfter);

  async function save(r: Row) {
    setBusy(r.venueName);
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
        setNote(r.venueName, data.error || "Save failed", "err");
        return;
      }
      // A cleared rule ("none") drops the after-time too.
      const savedAfter = r.restriction ? r.appliesAfter : "";
      patch(r.venueName, {
        appliesAfter: savedAfter,
        savedRestriction: r.restriction,
        savedAppliesAfter: savedAfter,
      });
      setNote(r.venueName, r.restriction ? "Rule saved" : "Rule cleared", "ok");
    } finally {
      setBusy(null);
    }
  }

  async function backfill(r: Row) {
    setBusy(r.venueName);
    try {
      const res = await fetch("/api/admin/venue-age-rules/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueName: r.venueName }),
      });
      const data = await res.json();
      if (!data.success) {
        setNote(r.venueName, data.error || "Backfill failed", "err");
        return;
      }
      setNote(
        r.venueName,
        `Tagged ${data.updated} existing show${data.updated === 1 ? "" : "s"}`,
        "ok",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${CARD} mb-8`}>
      <header className="mb-3">
        <h2 className="text-lg font-medium tracking-tight">Age rules</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          A blanket age restriction per venue, applied to shows as they&rsquo;re
          scraped. Add an &ldquo;after&rdquo; time to restrict only later shows
          (e.g. White Squirrel: 21+ after 8:00pm).
        </p>
      </header>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className={`${INPUT} w-full sm:flex-1`}
          placeholder="Filter venues…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-[#E8E0D0]/60">
          <input
            type="checkbox"
            checked={onlyWithRules}
            onChange={(e) => setOnlyWithRules(e.target.checked)}
          />
          Only venues with a rule ({activeCount})
        </label>
      </div>

      <datalist id="age-restriction-presets">
        {RESTRICTION_PRESETS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>

      <ul className="divide-y divide-[#E8E0D0]/10">
        {filtered.map((r) => {
          const dirty = isDirty(r);
          const note = notes[r.venueName];
          const working = busy === r.venueName;
          const summary = ruleSummary(r.savedRestriction, r.savedAppliesAfter);
          return (
            <li key={r.venueName} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {/* Venue + the currently-SAVED rule, always visible so an edit
                    in the fields below never hides what's actually in effect. */}
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none sm:basis-56">
                  <span className="truncate text-sm font-medium text-[#E8E0D0]">
                    {r.venueName}
                  </span>
                  {summary ? (
                    <span className="inline-flex w-fit max-w-full items-center gap-1.5 truncate rounded bg-[#E8E0D0]/12 px-2 py-0.5 text-xs text-[#E8E0D0]">
                      {summary}
                    </span>
                  ) : (
                    <span className="text-xs text-[#E8E0D0]/40">No rule set</span>
                  )}
                </div>

                {/* Editor */}
                <input
                  list="age-restriction-presets"
                  className={`${INPUT} min-w-[10rem] flex-1`}
                  value={r.restriction}
                  maxLength={120}
                  placeholder="No rule — e.g. 21+ or a note"
                  onChange={(e) => edit(r.venueName, { restriction: e.target.value })}
                  aria-label={`Age restriction for ${r.venueName}`}
                />

                <label
                  className={`flex shrink-0 items-center gap-1.5 text-sm ${
                    r.restriction ? "text-[#E8E0D0]/60" : "text-[#E8E0D0]/30"
                  }`}
                >
                  after
                  <input
                    type="time"
                    className={`${INPUT} disabled:opacity-40`}
                    value={r.appliesAfter}
                    disabled={!r.restriction}
                    onChange={(e) => edit(r.venueName, { appliesAfter: e.target.value })}
                    aria-label={`Apply only after this time for ${r.venueName}`}
                  />
                </label>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={BTN}
                    disabled={!dirty || working}
                    onClick={() => save(r)}
                  >
                    {working ? "…" : "Save"}
                  </button>
                  <button
                    className={BTN}
                    disabled={!r.savedRestriction || dirty || working}
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
              </div>

              {/* Fixed-height status line so a save/backfill message never
                  reflows the row. Shows dirty state until saved. */}
              <div className="mt-1 h-4 text-xs">
                {note ? (
                  <span
                    className={note.kind === "err" ? "text-[#E9A6A6]" : "text-[#9FC7A6]"}
                  >
                    {note.text}
                  </span>
                ) : dirty ? (
                  <span className="text-[#E8E0D0]/45">Unsaved changes</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
