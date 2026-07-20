"use client";

// Section arranger for /bands/[slug]/customize — reorder, move between the
// main column and the sidebar, and show/hide.
//
// Move buttons rather than drag-and-drop: it's keyboard- and screen-reader
// accessible with no dependency (the repo carries no DnD library), and it
// works on touch without a long-press gesture. Drag could be layered on later
// as an enhancement over the same state.
//
// Pinned sections (the moderation UI — pending member requests, the member
// request prompt) are never listed here; normalizeLayout keeps them in place
// on the server regardless of what this sends.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  REGIONS,
  SECTION_META,
  type BandProfileLayout,
  type Region,
  type SectionId,
} from "@/lib/bandProfileLayout";

const REGION_LABEL: Record<Region, string> = {
  main: "Main column",
  sidebar: "Sidebar",
};

const REGION_HINT: Record<Region, string> = {
  main: "The wide column beside your photo.",
  sidebar: "The narrow column under your photo.",
};

/** Layout with every pinned section stripped — what the editor manipulates.
 * They're re-inserted server-side, so leaving them out here keeps the UI
 * honest about what the band actually controls. */
function editable(layout: BandProfileLayout): BandProfileLayout {
  const keep = (ids: SectionId[]) => ids.filter((id) => !SECTION_META[id].pinned);
  return {
    main: keep(layout.main),
    sidebar: keep(layout.sidebar),
    hidden: keep(layout.hidden),
  };
}

export default function BandLayoutEditor({
  slug,
  initialLayout,
}: {
  slug: string;
  initialLayout: BandProfileLayout;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(() => editable(initialLayout));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Any edit invalidates a previous "Saved" badge.
  function apply(next: BandProfileLayout) {
    setLayout(next);
    setSaved(false);
  }

  function move(region: Region, index: number, delta: number) {
    const ids = [...layout[region]];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    apply({ ...layout, [region]: ids });
  }

  function switchRegion(from: Region, id: SectionId) {
    const to: Region = from === "main" ? "sidebar" : "main";
    apply({
      ...layout,
      [from]: layout[from].filter((s) => s !== id),
      [to]: [...layout[to], id],
    });
  }

  function hide(region: Region, id: SectionId) {
    apply({
      ...layout,
      [region]: layout[region].filter((s) => s !== id),
      hidden: [...layout.hidden, id],
    });
  }

  function show(id: SectionId) {
    apply({
      ...layout,
      main: [...layout.main, id],
      hidden: layout.hidden.filter((s) => s !== id),
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/bands/${slug}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't save your layout. Try again.");
        return;
      }
      // Adopt the server's normalized layout so the editor reflects exactly
      // what was stored, then refresh so the profile page picks it up.
      setLayout(editable(data.layout));
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const btn =
    "rounded border border-[#E8E0D0]/20 px-2 py-1 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="space-y-8">
      {REGIONS.map((region) => (
        <section key={region}>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            {REGION_LABEL[region]}
          </h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">{REGION_HINT[region]}</p>

          {layout[region].length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-[#E8E0D0]/15 px-3 py-4 text-sm italic text-[#E8E0D0]/40">
              Nothing here yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {layout[region].map((id, i) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-sm text-[#E8E0D0]/90">
                    {SECTION_META[id].label}
                  </span>
                  <button
                    type="button"
                    className={btn}
                    disabled={i === 0}
                    onClick={() => move(region, i, -1)}
                    aria-label={`Move ${SECTION_META[id].label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={i === layout[region].length - 1}
                    onClick={() => move(region, i, 1)}
                    aria-label={`Move ${SECTION_META[id].label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => switchRegion(region, id)}
                  >
                    Move to {region === "main" ? "sidebar" : "main"}
                  </button>
                  <button type="button" className={btn} onClick={() => hide(region, id)}>
                    Hide
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {layout.hidden.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Hidden
          </h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/45">
            These don&apos;t appear on your profile. Showing one adds it to the bottom of the
            main column.
          </p>
          <ul className="mt-3 space-y-2">
            {layout.hidden.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border border-dashed border-[#E8E0D0]/12 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm text-[#E8E0D0]/50">
                  {SECTION_META[id].label}
                </span>
                <button type="button" className={btn} onClick={() => show(id)}>
                  Show
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#E8E0D0]/12 pt-5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#E8E0D0]/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save layout"}
        </button>
        {saved && <span className="text-sm text-[#E8E0D0]/60">Saved.</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      <p className="text-xs text-[#E8E0D0]/40">
        A section with nothing in it stays hidden on your profile even when it&apos;s listed
        here — add the content first and it&apos;ll appear in the spot you chose.
      </p>
    </div>
  );
}
