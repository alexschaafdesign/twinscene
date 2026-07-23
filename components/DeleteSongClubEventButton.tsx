"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline delete for a Song Club event in the admin list. Two-click confirm (no
// blocking window.confirm) — first click arms, second deletes. Deleting an
// event cascades to its RSVPs (FK on delete cascade).
export default function DeleteSongClubEventButton({ id }: { id: number }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      await fetch(`/api/admin/song-club/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-[#E8E0D0]/50 transition hover:text-[#F5A3A3]"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="font-medium text-[#F5A3A3] disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]">
        Cancel
      </button>
    </span>
  );
}
