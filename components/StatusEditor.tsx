"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatStatusAge } from "./statusTime";

const MAX_STATUS_LENGTH = 140;

/** The old-Facebook status box, on a user's own profile: "[name] is ___".
 * Saves to PUT /api/profile/status. Clearing the box and saving removes the
 * status entirely. Kept inline (rather than in /profile/edit) because a status
 * is meant to be changed often — the edit form is for things you set once.
 *
 * `size="large"` is the prominent card treatment used on /profile and atop
 * /feed; the default stays compact for anywhere space is tighter. */
export default function StatusEditor({
  name,
  initialStatus,
  initialStatusAt,
  size = "default",
}: {
  name: string;
  initialStatus: string | null;
  initialStatusAt: string | null;
  size?: "default" | "large";
}) {
  const large = size === "large";
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
      <div
        onClick={large ? () => setEditing(true) : undefined}
        className={
          large
            ? "group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8B84B]/25 bg-gradient-to-br from-[#E8B84B]/[0.1] via-[#E8B84B]/[0.02] to-transparent px-5 py-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#E8B84B]/50 hover:shadow-[0_0_28px_-10px_rgba(232,184,75,0.4)] cursor-pointer"
            : "flex flex-wrap items-baseline gap-x-2 gap-y-1"
        }
      >
        <div className={large ? "flex flex-wrap items-center gap-x-2.5 gap-y-1" : "contents"}>
          {current ? (
            <>
              {large && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8B84B] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E8B84B]" />
                </span>
              )}
              <p className={large ? "text-base text-[#E8E0D0]" : "text-sm text-[#E8E0D0]/80"}>
                <span className="text-[#E8E0D0]/50">{name} is</span> {current}
              </p>
              {savedAt && <span className="text-xs text-[#E8E0D0]/40">{formatStatusAge(savedAt)}</span>}
            </>
          ) : (
            <p className={large ? "text-base text-[#E8E0D0]/40" : "text-sm text-[#E8E0D0]/40"}>
              {large ? <>{name} is… <span className="italic text-[#E8B84B]/50">what?</span></> : `${name} is…`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className={
            large
              ? "shrink-0 rounded-full bg-[#E8B84B] px-3.5 py-1.5 text-xs font-semibold text-[#2A2420] shadow-sm transition duration-200 group-hover:scale-105 hover:bg-[#f0c65f]"
              : "text-xs text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
          }
        >
          {current ? "Change" : "Set a status"}
        </button>
      </div>
    );
  }

  const remaining = MAX_STATUS_LENGTH - status.length;
  const counterColor =
    remaining <= 10 ? "text-[#F5A3A3]" : remaining <= 30 ? "text-[#E8B84B]" : "text-[#E8E0D0]/40";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(status);
      }}
      className={
        large
          ? "animate-fade-in flex flex-col gap-3 rounded-2xl border border-[#E8B84B]/40 bg-gradient-to-br from-[#E8B84B]/[0.1] via-[#E8B84B]/[0.03] to-transparent px-5 py-4 shadow-[0_0_28px_-10px_rgba(232,184,75,0.3)]"
          : "flex flex-col gap-2"
      }
    >
      <div className="flex items-center gap-2">
        <label htmlFor="user-status" className={large ? "shrink-0 text-base text-[#E8E0D0]/50" : "shrink-0 text-sm text-[#E8E0D0]/50"}>
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
          className={
            large
              ? "w-full rounded-full border border-[#E8B84B]/30 bg-black/20 px-4 py-2.5 text-base text-[#E8E0D0] placeholder:italic placeholder:text-[#E8E0D0]/35 transition duration-200 focus:border-[#E8B84B] focus:outline-none focus:ring-2 focus:ring-[#E8B84B]/30"
              : "w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          className={
            large
              ? "rounded-full bg-[#E8B84B] px-4 py-1.5 text-xs font-semibold text-[#2A2420] shadow-sm transition duration-200 hover:scale-105 hover:bg-[#f0c65f] disabled:opacity-50 disabled:hover:scale-100"
              : "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-xs transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
          }
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
        <span className={`text-xs transition-colors ${counterColor}`}>{remaining} left</span>
      </div>
      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
    </form>
  );
}
