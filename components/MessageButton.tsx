"use client";

// "Message this band" / "Message {musician}" entry point, rendered on band and
// musician pages. Signed-in users get an inline composer; posting creates (or
// reuses) the conversation and drops the user into the thread. Logged-out
// users are sent to /login. Hidden by the caller for anyone who already manages
// the profile — you don't message an inbox you own.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecipientType } from "@/lib/messaging";
import { iconProps } from "@/components/band-shared";

export default function MessageButton({
  recipientType,
  recipientId,
  label,
  loggedIn,
}: {
  recipientType: RecipientType;
  recipientId: number;
  label: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-md border border-[#E8E0D0]/25 px-3 py-1.5 text-sm font-medium text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0]";

  const icon = (
    // ti-message (Tabler)
    <svg {...iconProps} width={15} height={15}>
      <path d="M8 9h8" />
      <path d="M8 13h6" />
      <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />
    </svg>
  );

  if (!loggedIn) {
    return (
      <a href="/login?next=/" className={buttonClass}>
        {icon}
        {label}
      </a>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        {icon}
        {label}
      </button>
    );
  }

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType, recipientId, body: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Couldn't send. Try again.");
        setSending(false);
        return;
      }
      router.push(`/profile/messages/${data.conversationId}`);
    } catch {
      setError("Couldn't send. Try again.");
      setSending(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={`Message ${label.replace(/^Message\s+/, "")}…`}
        className="w-full resize-y rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/5 px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 focus:border-[#E8E0D0]/50 focus:outline-none"
      />
      {error && <p className="text-xs text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          className="inline-flex items-center rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]/80"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
