"use client";

// Recipient-side control in a message thread: block or unblock the person who
// started it. Blocking stops them sending any further messages to this
// band/musician (server-enforced). A blocked thread stays visible on both
// sides — this just toggles whether new messages from them are accepted.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BlockToggle({
  conversationId,
  personName,
  initialBlocked,
}: {
  conversationId: string;
  personName: string;
  initialBlocked: boolean;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "block" | "unblock") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${conversationId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Couldn't update. Try again.");
        setBusy(false);
        return;
      }
      setBlocked(data.blocked);
      setConfirming(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Couldn't update. Try again.");
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-[#E8E0D0]/50">
          {personName} is blocked — they can&apos;t send new messages.
        </span>
        <button
          type="button"
          onClick={() => send("unblock")}
          disabled={busy}
          className="text-[#E8E0D0]/70 underline underline-offset-2 transition hover:text-[#E8E0D0] disabled:opacity-50"
        >
          Unblock
        </button>
        {error && <span className="text-[#F5A3A3]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {confirming ? (
        <>
          <span className="text-[#E8E0D0]/60">Block {personName}?</span>
          <button
            type="button"
            onClick={() => send("block")}
            disabled={busy}
            className="font-medium text-[#F5A3A3] underline underline-offset-2 transition hover:text-[#F7B8B8] disabled:opacity-50"
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]/80"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[#E8E0D0]/45 transition hover:text-[#F5A3A3]"
        >
          Block {personName}
        </button>
      )}
      {error && <span className="text-[#F5A3A3]">{error}</span>}
    </div>
  );
}
