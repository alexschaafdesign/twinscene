"use client";

import { useState } from "react";

// Per-row admin grant/revoke for /admin/users. Like BandEditorsManager, this
// only reflects what the server accepted — the API route re-checks is_admin
// and refuses self-demotion and last-admin demotion on its own.
export default function UserAdminToggle({
  userId,
  initialIsAdmin,
  label,
  isSelf,
}: {
  userId: number;
  initialIsAdmin: boolean;
  // Name/email of the target, so the confirm prompt names who it's about.
  label: string;
  isSelf: boolean;
}) {
  const [admin, setAdmin] = useState(initialIsAdmin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Self-demotion is a dead end (the server refuses it), so don't offer it.
  if (admin && isSelf) {
    return <span className="text-xs text-[#E8E0D0]/40">you</span>;
  }

  async function handleToggle() {
    const next = !admin;
    const verb = next ? "Make" : "Remove";
    if (!window.confirm(`${verb} ${label} ${next ? "an admin" : "as an admin"}?`)) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      setAdmin(data.is_admin);
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`rounded-md border px-2.5 py-1 text-xs whitespace-nowrap transition disabled:opacity-50 ${
          admin
            ? "border-[#F5A3A3]/40 text-[#F5A3A3] hover:bg-[#F5A3A3]/10"
            : "border-[#E8E0D0]/30 text-[#E8E0D0]/80 hover:bg-[#E8E0D0]/10"
        }`}
      >
        {saving ? "Saving…" : admin ? "Remove admin" : "Make admin"}
      </button>
      {error && <span className="text-xs text-[#F5A3A3]">{error}</span>}
    </div>
  );
}
