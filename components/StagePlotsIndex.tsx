"use client";

// The list of a band's stage plots at /bands/[slug]/stage-plots. Create, open
// the editor, export a PDF, or delete. All mutations hit canEditBand-gated
// routes; the list itself is only reachable by an editor (the page gates), but
// the routes gate again — a missing button is not a permission check.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StagePlotSummary } from "@/lib/stagePlots";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default function StagePlotsIndex({
  slug,
  initialPlots,
}: {
  slug: string;
  initialPlots: StagePlotSummary[];
}) {
  const router = useRouter();
  const [plots, setPlots] = useState(initialPlots);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function createPlot() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/bands/${slug}/stage-plots`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't create a stage plot. Try again.");
        return;
      }
      router.push(`/bands/${slug}/stage-plots/${data.id}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function deletePlot(id: number, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`/api/stage-plots/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't delete that plot. Try again.");
        return;
      }
      setPlots((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const btn =
    "rounded border border-[#E8E0D0]/20 px-2.5 py-1 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createPlot}
          disabled={creating}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#E8E0D0]/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating…" : "New stage plot"}
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {plots.length === 0 ? (
        <p className="rounded-md border border-dashed border-[#E8E0D0]/15 px-4 py-6 text-sm italic text-[#E8E0D0]/45">
          No stage plots yet. Create one to start placing gear and building an input list.
        </p>
      ) : (
        <ul className="space-y-2">
          {plots.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/bands/${slug}/stage-plots/${p.id}`}
                  className="text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
                >
                  {p.name}
                </Link>
                <p className="mt-0.5 text-xs text-[#E8E0D0]/45">
                  {p.item_count} {p.item_count === 1 ? "item" : "items"} · {p.input_count}{" "}
                  {p.input_count === 1 ? "channel" : "channels"} · updated {formatDate(p.updated_at)}
                </p>
              </div>
              <Link href={`/bands/${slug}/stage-plots/${p.id}`} className={btn}>
                Edit
              </Link>
              <a href={`/api/stage-plots/${p.id}/pdf`} className={btn}>
                Export PDF
              </a>
              <button
                type="button"
                className={btn}
                disabled={deletingId === p.id}
                onClick={() => deletePlot(p.id, p.name)}
              >
                {deletingId === p.id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
