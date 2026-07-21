"use client";

import { useState } from "react";
import Link from "next/link";
import type { PressStarResult } from "@/lib/scrapers/starPress";
import type { ReconcileReport } from "@/lib/scrapers/reconcile";

type OutletInfo = { id: string; name: string };
type Historical = { ranAt: string; press: PressStarResult; reconcile?: ReconcileReport } | null;

type Phase = "idle" | "running" | "done" | "error";
type OutletState = {
  phase: Phase;
  press?: PressStarResult;
  reconcile?: ReconcileReport;
  error?: string;
};

const CARD =
  "flex flex-col rounded-lg border border-[rgba(232,224,208,0.15)] border-l-[3px] border-l-[rgba(232,224,208,0.12)] bg-[rgba(232,224,208,0.02)] transition hover:border-[rgba(232,224,208,0.3)]";
const BTN =
  "rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10 disabled:cursor-not-allowed disabled:opacity-40";
const RED = "#E5A0A0";
const AMBER = "#E8B84B";

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pressLine(p: PressStarResult): string {
  const parts = [`${p.picks} picks`, `${p.starred} starred`];
  if (p.unmatched) parts.push(`${p.unmatched} unmatched`);
  if (p.errors) parts.push(`${p.errors} error${p.errors === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function reconcileLine(r: ReconcileReport): string {
  return `${r.matched} matched · ${r.applied} applied · ${r.unmatched} missing`;
}

export default function PressDashboard({
  outlets,
  latestByOutlet,
  reconcileOutletIds,
  secret,
}: {
  outlets: OutletInfo[];
  latestByOutlet: Record<string, Historical>;
  // Outlets whose post also drives the reconcile pass (missing-show list on
  // /admin/reconcile) — see lib/scrapers/reconcile.ts's COMPLETE_LIST_SOURCES.
  reconcileOutletIds: string[];
  secret: string;
}) {
  const [states, setStates] = useState<Record<string, OutletState>>({});
  const q = `secret=${encodeURIComponent(secret)}`;

  async function runOne(id: string) {
    setStates((prev) => ({ ...prev, [id]: { phase: "running" } }));
    try {
      const res = await fetch(`/api/scrape/press/${id}?${q}`);
      const data = (await res.json()) as {
        press?: PressStarResult;
        reconcile?: ReconcileReport;
        error?: string;
      };
      if (!res.ok || !data.press) throw new Error(data.error || `HTTP ${res.status}`);
      setStates((prev) => ({
        ...prev,
        [id]: { phase: "done", press: data.press, reconcile: data.reconcile },
      }));
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [id]: { phase: "error", error: err instanceof Error ? err.message : "Failed" },
      }));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {outlets.map((outlet) => {
        const s = states[outlet.id];
        const hist = latestByOutlet[outlet.id];
        const busy = s?.phase === "running";

        let body: React.ReactNode;
        if (busy) {
          body = <span className="text-[#E8E0D0]/60">Running…</span>;
        } else if (s?.phase === "error") {
          body = (
            <span className="line-clamp-2" style={{ color: RED }}>
              error — {s.error}
            </span>
          );
        } else if (s?.press) {
          body = (
            <div className="flex flex-col gap-1">
              <span className="text-[#E8E0D0]/70">{pressLine(s.press)}</span>
              {s.reconcile && (
                <span className="text-[#E8E0D0]/70">{reconcileLine(s.reconcile)}</span>
              )}
            </div>
          );
        } else if (hist) {
          body = (
            <div className="flex flex-col gap-1 text-[#E8E0D0]/50">
              <span className="line-clamp-2">
                Last run {formatTs(hist.ranAt)} · {pressLine(hist.press)}
              </span>
              {hist.reconcile && <span>{reconcileLine(hist.reconcile)}</span>}
            </div>
          );
        } else {
          body = <span className="text-[#E8E0D0]/45">Never run</span>;
        }

        let accent: string | undefined;
        if (s?.phase === "error") accent = RED;
        else if (s?.press && (s.press.unmatched > 0 || s.press.errors > 0)) accent = AMBER;

        return (
          <div key={outlet.id} className={CARD} style={accent ? { borderLeftColor: accent } : undefined}>
            <div className="flex flex-1 flex-col gap-2.5 p-3.5">
              <p className="min-w-0 truncate font-medium text-[#E8E0D0]">{outlet.name}</p>
              <div className="min-h-[2.25rem] text-xs">{body}</div>
              {reconcileOutletIds.includes(outlet.id) && (
                <Link
                  href="/admin/reconcile"
                  className="text-xs text-[#E8E0D0]/50 underline decoration-dotted hover:text-[#E8E0D0]"
                >
                  Review missing shows →
                </Link>
              )}
              <button
                type="button"
                onClick={() => runOne(outlet.id)}
                disabled={busy}
                className={`${BTN} mt-auto w-full`}
              >
                {busy ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                    />
                    Running…
                  </span>
                ) : (
                  "Run now"
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
