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

/** "2026-07-14" -> "Tue, Jul 14". Parsed as UTC noon so no local-tz day drift. */
function formatDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Grouping key for duplicate clustering — same idea as reviewFlags' cross-source check. */
function dupeKey(show: Show): string {
  return `${show.date}|${show.venue.trim().toLowerCase()}|${show.title.trim().toLowerCase()}`;
}

export default function ReviewPanel({
  shows,
  secret,
  windowDays,
}: {
  shows: Show[];
  secret: string;
  windowDays: number;
}) {
  const [items, setItems] = useState(shows);
  const q = secret ? `secret=${encodeURIComponent(secret)}` : "";

  const dateGroups = useMemo(() => {
    const byDate = new Map<string, Show[]>();
    for (const show of items) {
      const list = byDate.get(show.date) ?? [];
      list.push(show);
      byDate.set(show.date, list);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateShows]) => {
        const clusters = new Map<string, Show[]>();
        for (const show of dateShows) {
          const key = dupeKey(show);
          const list = clusters.get(key) ?? [];
          list.push(show);
          clusters.set(key, list);
        }
        const duplicateClusters = Array.from(clusters.values()).filter((c) => c.length > 1);
        const clustered = new Set(duplicateClusters.flat().map((s) => s.id));
        const singles = dateShows
          .filter((s) => !clustered.has(s.id))
          .sort((a, b) => {
            if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
            return a.venue.localeCompare(b.venue);
          });
        return { date, duplicateClusters, singles };
      });
  }, [items]);

  const totalFlagged = items.filter((s) => s.needsReview).length;

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
    if (!window.confirm(`Delete "${show.title}" (${show.venue}, ${show.date})?`)) return;
    await remove(show.id);
  }

  async function handleKeepThisOne(cluster: Show[], keepId: string) {
    const others = cluster.filter((s) => s.id !== keepId);
    if (
      !window.confirm(
        `Keep "${cluster.find((s) => s.id === keepId)?.title}" and delete the other ${
          others.length
        } duplicate${others.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    for (const other of others) {
      await remove(other.id);
    }
  }

  async function handleLooksGood(id: string) {
    const res = await fetch("/api/shows/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, secret }),
    });
    const data = await res.json();
    if (!data.success) {
      window.alert(data.error || "Failed");
      return;
    }
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, needsReview: false, reviewReasons: [] } : s)),
    );
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
    setItems((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, ...form, needsReview: false, confidence: "ok", reviewReasons: [] }
          : s,
      ),
    );
    return true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E0D0]/20 pb-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Review Shows</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">
            Next {windowDays} days · {items.length} show{items.length === 1 ? "" : "s"} ·{" "}
            {totalFlagged} flagged
          </p>
        </div>
        <a href={`/shows/import?${q}`} className={BTN}>
          Live re-scrape import →
        </a>
      </header>

      {dateGroups.length === 0 && (
        <p className="text-sm text-[#E8E0D0]/55">No shows in this window.</p>
      )}

      <div className="space-y-10">
        {dateGroups.map(({ date, duplicateClusters, singles }) => (
          <section key={date}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#E8E0D0]/50">
              {formatDateHeading(date)}
            </h2>
            <div className="space-y-3">
              {duplicateClusters.map((cluster) => (
                <div
                  key={cluster.map((s) => s.id).join(",")}
                  className="rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/5 p-3"
                >
                  <p className="mb-2 text-xs text-[#E8B84B]">
                    Possible duplicate — same date, venue, and title from {cluster.length} sources
                  </p>
                  <div className="space-y-2">
                    {cluster.map((show) => (
                      <ShowCard
                        key={show.id}
                        show={show}
                        onDelete={() => handleDelete(show)}
                        onLooksGood={() => handleLooksGood(show.id)}
                        onSaveEdit={(form) => handleSaveEdit(show.id, form)}
                        extraAction={{
                          label: "Keep this one",
                          onClick: () => handleKeepThisOne(cluster, show.id),
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {singles.map((show) => (
                <ShowCard
                  key={show.id}
                  show={show}
                  onDelete={() => handleDelete(show)}
                  onLooksGood={() => handleLooksGood(show.id)}
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

function ShowCard({
  show,
  onDelete,
  onLooksGood,
  onSaveEdit,
  extraAction,
}: {
  show: Show;
  onDelete: () => void;
  onLooksGood: () => void;
  onSaveEdit: (form: EditForm) => Promise<boolean>;
  extraAction?: { label: string; onClick: () => void };
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
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN} onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[#E8E0D0]">
            {show.title}{" "}
            <span className="text-[#E8E0D0]/50">— {show.venue}</span>
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
          {show.needsReview && show.reviewReasons.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {show.reviewReasons.map((reason, i) => (
                <li
                  key={i}
                  className="rounded bg-[#E8B84B]/15 px-2 py-0.5 text-xs text-[#E8B84B]"
                >
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {extraAction && (
            <button type="button" className={BTN} onClick={extraAction.onClick}>
              {extraAction.label}
            </button>
          )}
          {show.needsReview && (
            <button type="button" className={BTN} onClick={onLooksGood}>
              ✓ Looks good
            </button>
          )}
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
