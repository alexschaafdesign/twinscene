"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin create/edit form for a Song Club event. `mode: "add"` POSTs to
// /api/admin/song-club; `mode: "edit"` PATCHes /api/admin/song-club/[id].
export interface SongClubEventFormValues {
  id?: number;
  title: string;
  eventDate: string; // yyyy-mm-dd
  startTime: string;
  endTime: string;
  venueName: string;
  address: string;
  arrivalNotes: string;
  description: string;
  flyerUrl: string;
  published: boolean;
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

export default function SongClubEventForm({
  mode,
  initial,
}: {
  mode: "add" | "edit";
  initial?: Partial<SongClubEventFormValues>;
}) {
  const router = useRouter();
  const [v, setV] = useState<SongClubEventFormValues>({
    title: initial?.title ?? "",
    eventDate: initial?.eventDate ?? "",
    startTime: initial?.startTime ?? "",
    endTime: initial?.endTime ?? "",
    venueName: initial?.venueName ?? "",
    address: initial?.address ?? "",
    arrivalNotes: initial?.arrivalNotes ?? "",
    description: initial?.description ?? "",
    flyerUrl: initial?.flyerUrl ?? "",
    published: initial?.published ?? false,
  });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const set =
    (k: keyof SongClubEventFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const url = mode === "add" ? "/api/admin/song-club" : `/api/admin/song-club/${initial?.id}`;
    const method = mode === "add" ? "POST" : "PATCH";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: v.title,
          eventDate: v.eventDate,
          startTime: v.startTime,
          endTime: v.endTime,
          venueName: v.venueName,
          address: v.address,
          arrivalNotes: v.arrivalNotes,
          description: v.description,
          flyerUrl: v.flyerUrl,
          published: v.published,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      router.push("/admin/song-club");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title">
        <input className={inputClass} value={v.title} onChange={set("title")} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" className={inputClass} value={v.eventDate} onChange={set("eventDate")} required />
        </Field>
        <Field label="Start time" hint='e.g. "7:00 PM"'>
          <input className={inputClass} value={v.startTime} onChange={set("startTime")} placeholder="7:00 PM" />
        </Field>
        <Field label="End time">
          <input className={inputClass} value={v.endTime} onChange={set("endTime")} placeholder="9:00 PM" />
        </Field>
      </div>

      <Field label="Venue name">
        <input className={inputClass} value={v.venueName} onChange={set("venueName")} />
      </Field>
      <Field label="Address" hint="Emailed to attendees who RSVP">
        <input className={inputClass} value={v.address} onChange={set("address")} placeholder="123 Main St, Minneapolis MN 55407" />
      </Field>
      <Field label="Arrival notes" hint="Parking, how to find the door, etc. — included in the email">
        <textarea className={`${inputClass} min-h-16`} value={v.arrivalNotes} onChange={set("arrivalNotes")} />
      </Field>
      <Field label="Description / theme" hint="Shown on the event page and included in the confirmation email">
        <textarea className={`${inputClass} min-h-24`} value={v.description} onChange={set("description")} />
      </Field>
      <Field label="Flyer image URL" hint="Optional">
        <input className={inputClass} value={v.flyerUrl} onChange={set("flyerUrl")} placeholder="https://…" />
      </Field>

      <label className="flex items-center gap-2 text-sm text-[#E8E0D0]/85">
        <input
          type="checkbox"
          checked={v.published}
          onChange={(e) => setV((prev) => ({ ...prev, published: e.target.checked }))}
          className="h-4 w-4 accent-[#E8E0D0]"
        />
        Published (visible on the public Song Club page + accepts RSVPs)
      </label>

      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : mode === "add" ? "Create event" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
