"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatStatusAge } from "./statusTime";

const MAX_STATUS_LENGTH = 140;

/** The old-Facebook status box, on a user's own profile: "[name] is ___".
 * Saves to PUT /api/profile/status. Clearing the box and saving removes the
 * status entirely. Kept inline (rather than in /profile/edit) because a status
 * is meant to be changed often — the edit form is for things you set once. */
export default function StatusEditor({
  name,
  initialStatus,
  initialStatusAt,
}: {
  name: string;
  initialStatus: string | null;
  initialStatusAt: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus ?? "");
  const [savedAt, setSavedAt] = useState(initialStatusAt);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const current = initialStatus;

  async function save(next: string) {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/profile/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Couldn't save your status");
        setState("error");
        return;
      }
      setStatus(data.status ?? "");
      setSavedAt(data.statusAt ?? null);
      setEditing(false);
      setState("idle");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setState("error");
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {current ? (
          <>
            <p className="text-sm text-[#E8E0D0]/80">
              <span className="text-[#E8E0D0]/50">{name} is</span> {current}
            </p>
            {savedAt && <span className="text-xs text-[#E8E0D0]/40">{formatStatusAge(savedAt)}</span>}
          </>
        ) : (
          <p className="text-sm text-[#E8E0D0]/40">{name} is…</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          {current ? "Change" : "Set a status"}
        </button>
      </div>
    );
  }

  const remaining = MAX_STATUS_LENGTH - status.length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(status);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="user-status" className="shrink-0 text-sm text-[#E8E0D0]/50">
          {name} is
        </label>
        <input
          id="user-status"
          type="text"
          value={status}
          autoFocus
          onChange={(e) => setStatus(e.target.value.slice(0, MAX_STATUS_LENGTH))}
          maxLength={MAX_STATUS_LENGTH}
          placeholder="at First Ave tonight"
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus(initialStatus ?? "");
            setEditing(false);
            setError(null);
            setState("idle");
          }}
          className="text-xs text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
        >
          Cancel
        </button>
        {current && (
          <button
            type="button"
            onClick={() => void save("")}
            disabled={state === "saving"}
            className="text-xs text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0] disabled:opacity-50"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-[#E8E0D0]/40">{remaining} left</span>
      </div>
      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
    </form>
  );
}
