"use client";

import { useMemo, useState } from "react";
import type { Show } from "@/lib/fetchShows";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_DANGER =
  "rounded-md border border-[#E5A0A0]/50 px-3 py-1.5 text-sm text-[#E5A0A0] transition hover:bg-[#E5A0A0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

type EditForm = {
  date: string;
  venue: string;
  title: string;
  lineup: string;
  notes: string;
  link: string;
};

function toEditForm(show: Show): EditForm {
  return {
    date: show.date,
    venue: show.venue,
    title: show.title,
    lineup: show.lineup,
    notes: show.notes,
    link: show.link,
  };
}

/** "2026-07-14" -> "Tue, Jul 14, 2026". Parsed as UTC noon so no local-tz day drift. */
function formatDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AllShowsPanel({
  shows,
  secret,
}: {
  shows: Show[];
  secret: string;
}) {
  const [items, setItems] = useState(shows);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.venue.toLowerCase().includes(q) ||
        s.lineup.toLowerCase().includes(q),
    );
  }, [items, query]);

  const dateGroups = useMemo(() => {
    const byDate = new Map<string, Show[]>();
    for (const show of filtered) {
      const list = byDate.get(show.date) ?? [];
      list.push(show);
      byDate.set(show.date, list);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dateShows]) => ({
        date,
        dateShows: dateShows.sort((a, b) => a.venue.localeCompare(b.venue)),
      }));
  }, [filtered]);

  async function remove(id: string) {
    const res = await fetch("/api/shows/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, secret }),
    });
    const data = await res.json();
    if (!data.success) {
      window.alert(data.error || "Delete failed");
      return false;
    }
    setItems((prev) => prev.filter((s) => s.id !== id));
    return true;
  }

  async function handleDelete(show: Show) {
    if (!window.confirm(`Delete "${show.title}" (${show.venue}, ${show.date})? This can't be undone.`))
      return;
    await remove(show.id);
  }

  async function handleSaveEdit(id: string, form: EditForm) {
    const res = await fetch("/api/shows/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, secret, ...form }),
    });
    const data = await res.json();
    if (!data.success) {
      window.alert(data.error || "Save failed");
      return false;
    }
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...form } : s)));
    return true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E0D0]/20 pb-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">All Shows</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">
            {items.length} show{items.length === 1 ? "" : "s"} total
            {query && ` — ${filtered.length} matching`}
          </p>
        </div>
        <a href={`/admin/review?secret=${encodeURIComponent(secret)}`} className={BTN}>
          ← Flagged for review
        </a>
      </header>

      <input
        className={`${INPUT} mb-8`}
        placeholder="Search by title, venue, or lineup…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {dateGroups.length === 0 && (
        <p className="text-sm text-[#E8E0D0]/55">No shows match.</p>
      )}

      <div className="space-y-10">
        {dateGroups.map(({ date, dateShows }) => (
          <section key={date}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#E8E0D0]/50">
              {formatDateHeading(date)}
            </h2>
            <div className="space-y-3">
              {dateShows.map((show) => (
                <ShowRow
                  key={show.id}
                  show={show}
                  onDelete={() => handleDelete(show)}
                  onSaveEdit={(form) => handleSaveEdit(show.id, form)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function ShowRow({
  show,
  onDelete,
  onSaveEdit,
}: {
  show: Show;
  onDelete: () => void;
  onSaveEdit: (form: EditForm) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toEditForm(show));
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setForm(toEditForm(show));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const ok = await onSaveEdit(form);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className={`${CARD} space-y-2`}>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className={INPUT}
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <input
            className={INPUT}
            placeholder="Venue"
            value={form.venue}
            onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
          />
        </div>
        <input
          className={INPUT}
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className={INPUT}
          placeholder="Lineup (comma-separated)"
          value={form.lineup}
          onChange={(e) => setForm((f) => ({ ...f, lineup: e.target.value }))}
        />
        <input
          className={INPUT}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        <input
          className={INPUT}
          placeholder="Link"
          value={form.link}
          onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
        />
        <div className="flex justify-between gap-2 pt-1">
          <button type="button" className={BTN_DANGER} onClick={onDelete} disabled={saving}>
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" className={BTN} onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[#E8E0D0]">
            {show.title} <span className="text-[#E8E0D0]/50">— {show.venue}</span>
          </p>
          {show.lineup && (
            <p className="mt-0.5 text-xs text-[#E8E0D0]/55 break-words">{show.lineup}</p>
          )}
          <p className="mt-1 text-xs text-[#E8E0D0]/40">
            {show.source} · {show.eventType || "show"}
          </p>
          {show.confidence === "broken" && (
            <p className="mt-2 inline-block rounded bg-[#E5A0A0]/15 px-2 py-0.5 text-xs text-[#E5A0A0]">
              Hidden from public — check date
            </p>
          )}
          {show.needsReview && (
            <p className="mt-2 inline-block rounded bg-[#E8B84B]/15 px-2 py-0.5 text-xs text-[#E8B84B]">
              Flagged for review
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" className={BTN} onClick={startEdit}>
            Edit
          </button>
          <button type="button" className={BTN_DANGER} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
