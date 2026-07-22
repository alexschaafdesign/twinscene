"use client";

// Reply box at the bottom of a thread. Posts to the conversation endpoint,
// which decides the sending identity server-side (initiator → as self; recipient
// side → as the band/musician), then refreshes the server-rendered thread.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MessageReplyForm({
  conversationId,
  sendingAsLabel,
}: {
  conversationId: string;
  // Whom the reply is attributed to, e.g. "as yourself" or "as Yellow Ostrich".
  sendingAsLabel: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Couldn't send. Try again.");
        setSending(false);
        return;
      }
      setBody("");
      setSending(false);
      router.refresh();
    } catch {
      setError("Couldn't send. Try again.");
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={`Reply ${sendingAsLabel}…`}
        className="w-full resize-y rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/5 px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 focus:border-[#E8E0D0]/50 focus:outline-none"
      />
      {error && <p className="text-xs text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          className="inline-flex items-center rounded-md bg-[#E8E0D0] px-4 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <span className="text-xs text-[#E8E0D0]/40">Sending {sendingAsLabel}</span>
      </div>
    </div>
  );
}
