"use client";

import { useState } from "react";
import type { ComradeEditor } from "@/lib/comradeEditors";

// Minimal admin add-by-email / remove UI for a comrade listing's editors.
// Every action hits the server-gated API route — this component's only job
// is to reflect what the server accepted. Mirrors MediaProEditorsManager.tsx.
export default function ComradeEditorsManager({
  slug,
  initialEditors,
}: {
  slug: string;
  initialEditors: ComradeEditor[];
}) {
  const [editors, setEditors] = useState(initialEditors);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/admin/comrades/${slug}/editors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setEditors((prev) => [...prev.filter((ed) => ed.user_id !== data.editor.user_id), data.editor]);
      setEmail("");
      setStatus("idle");
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  async function handleRemove(userId: number) {
    setError("");
    try {
      const res = await fetch(`/api/admin/comrades/${slug}/editors`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        return;
      }
      setEditors((prev) => prev.filter((ed) => ed.user_id !== userId));
    } catch {
      setError("Something went wrong");
    }
  }

  return (
    <div className="mt-6">
      <ul className="flex flex-col gap-2">
        {editors.length === 0 && (
          <li className="text-sm text-[#E8E0D0]/50">No editors assigned yet.</li>
        )}
        {editors.map((ed) => (
          <li
            key={ed.user_id}
            className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
          >
            <span>
              {ed.email} <span className="text-[#E8E0D0]/50">({ed.role})</span>
            </span>
            <button
              onClick={() => handleRemove(ed.user_id)}
              className="text-[#F5A3A3] hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="mt-4 flex gap-2">
        <input
          type="email"
          required
          placeholder="editor@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
        >
          {status === "saving" ? "Adding…" : "Add editor"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
