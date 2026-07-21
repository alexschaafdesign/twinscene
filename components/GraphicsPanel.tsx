"use client";

import { useEffect, useState } from "react";

const CARD = "rounded-md border border-[rgba(232,224,208,0.15)] p-4";
const BTN_PRIMARY =
  "rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-40";

type State = { status: "idle" | "loading" | "done" | "error"; message: string };
const IDLE: State = { status: "idle", message: "" };

/** Small inline spinner + label for loading buttons. */
function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      />
      {label}
    </span>
  );
}

export default function GraphicsPanel() {
  const [state, setState] = useState<State>(IDLE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Revoke the previous blob URL whenever a new preview replaces it or the
  // panel unmounts, so we don't leak object URLs across regenerations.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function downloadTodayGraphic() {
    setState({ status: "loading", message: "" });
    try {
      const res = await fetch("/api/og/today");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const showDate = res.headers.get("X-Show-Date") || "today";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      const a = document.createElement("a");
      a.href = url;
      a.download = `twinscene-shows-${showDate}.png`;
      a.click();

      setState({ status: "done", message: "Downloaded." });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight">Show graphics</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Generate shareable graphics from the schedule.
        </p>
      </header>

      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-[#E8E0D0]">Today&apos;s show graphic</p>
            <p className="mt-1 text-xs text-[#E8E0D0]/55">
              Generates the story-format PNG for tomorrow&apos;s date (it&apos;s
              labeled &ldquo;TODAY&rdquo; since it&apos;s meant to be posted the
              day of).
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTodayGraphic}
            disabled={state.status === "loading"}
            className={BTN_PRIMARY}
          >
            {state.status === "loading" ? (
              <Spinner label="Generating…" />
            ) : (
              "Download today's show graphic"
            )}
          </button>
        </div>

        {state.status !== "idle" && state.status !== "loading" && (
          <p
            className={`mt-3 text-sm ${
              state.status === "error" ? "text-[#E5A0A0]" : "text-[#8FD08F]"
            }`}
          >
            {state.message}
          </p>
        )}

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Preview of today's show graphic"
            className="mt-4 w-40 rounded-md border border-[#E8E0D0]/15"
          />
        )}
      </div>
    </main>
  );
}
