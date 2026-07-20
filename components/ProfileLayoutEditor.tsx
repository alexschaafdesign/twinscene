"use client";

// In-place layout editing for a band profile.
//
// You're looking at the real profile, not a form: hit "Edit layout" and
// draggable overlays drop over the actual sections. Rearrange them where they
// live, hit Save, and the overlays disappear.
//
// How it stays cheap: the sections arrive already rendered from the server
// (BandProfile builds them and passes them in as `sections`), so this
// component only ever reorders opaque nodes. It never needs the band's data,
// and reordering costs no server round-trip.
//
// Pointer Events rather than HTML5 drag-and-drop — HTML5 DnD never fires on
// touch, and plenty of bands will do this on a phone. Move/up are bound to
// `window` rather than relying on pointer capture, so a drag that leaves the
// element (or crosses an iframe) still tracks.
//
// The overlays are load-bearing, not decoration: Bandcamp and YouTube embeds
// swallow pointer events, so without a capture layer a drag would die the
// moment it crossed one.
//
// Not accessible — dragging is mouse/touch only. /bands/<slug>/customize is
// the keyboard and screen-reader path to the same layout, and stays supported.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BandProfileShell from "@/components/BandProfileShell";
import {
  REGIONS,
  SECTION_META,
  type BandProfileLayout,
  type Region,
  type SectionId,
} from "@/lib/bandProfileLayout";
import type { ReactNode } from "react";

type Drag = { id: SectionId; from: Region; fromIndex: number };
type Drop = { region: Region; index: number };

/** Pixels from the viewport edge where a drag starts scrolling the page. */
const SCROLL_EDGE = 90;
const SCROLL_SPEED = 14;

export default function ProfileLayoutEditor({
  slug,
  initialLayout,
  sections,
  emptyIds,
  photo,
  header,
}: {
  slug: string;
  initialLayout: BandProfileLayout;
  /** Every section, server-rendered, keyed by id. */
  sections: Partial<Record<SectionId, ReactNode>>;
  /** Sections that would render nothing right now — shown as placeholders
   * while editing so they can still be positioned. */
  emptyIds: SectionId[];
  photo: ReactNode;
  header: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The layout to restore if the band cancels out of edit mode.
  const committed = useRef(initialLayout);
  const pointerY = useRef(0);

  const empty = new Set(emptyIds);

  // Below md the grid collapses to one column, so "sidebar" and "main" aren't
  // visually distinguishable — cross-region drops there would be a coin flip.
  // Reordering still works; only moving between regions is held back.
  const [wideEnough, setWideEnough] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWideEnough(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /** Which region and slot the pointer is over. Regions are hit-tested by
   * their container box (nearest wins, so the gap between columns still
   * resolves); the slot is the first section whose midpoint we've passed. */
  const locate = useCallback(
    (clientY: number, clientX: number, dragged: Drag): Drop => {
      let best: { region: Region; distance: number } | null = null;

      for (const region of REGIONS) {
        if (!wideEnough && region !== dragged.from) continue;
        const el = document.querySelector(`[data-region="${region}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
        const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
        const distance = Math.hypot(dx, dy);
        if (!best || distance < best.distance) best = { region, distance };
      }

      const region = best?.region ?? dragged.from;
      const ids = layout[region];

      let index = ids.length;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === dragged.id) continue;
        const el = document.querySelector(`[data-region="${region}"] [data-section="${ids[i]}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { region, index };
    },
    [layout, wideEnough],
  );

  // Move/up on `window`, so the drag survives leaving the overlay — and an
  // rAF loop scrolls the page when the pointer nears a viewport edge, since a
  // profile is far taller than the screen.
  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      e.preventDefault();
      pointerY.current = e.clientY;
      setDrop(locate(e.clientY, e.clientX, drag!));
    }
    function onUp() {
      setDrag(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrop(null);
        setDrag(null);
      }
    }

    // Seeded here rather than on pointerdown so the edge-scroll loop has a
    // neutral starting value until the first move arrives.
    pointerY.current = window.innerHeight / 2;

    let frame = 0;
    const tick = () => {
      const y = pointerY.current;
      if (y < SCROLL_EDGE) window.scrollBy(0, -SCROLL_SPEED);
      else if (y > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_SPEED);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, locate]);

  // Commit on release. Kept out of the pointerup handler so it reads the drop
  // target from the same render that drew the indicator — what you saw is
  // exactly what lands.
  const previousDrag = useRef<Drag | null>(null);
  useEffect(() => {
    const from = previousDrag.current;
    previousDrag.current = drag;
    if (!from || drag) return;

    const target = drop;
    setDrop(null);
    if (!target) return;

    // A press that never moved is a click, not a rearrangement.
    if (
      target.region === from.from &&
      (target.index === from.fromIndex || target.index === from.fromIndex + 1)
    ) {
      return;
    }

    setLayout((current) => {
      const without = current[from.from].filter((s) => s !== from.id);
      // Removing the section first shifts later slots in that same region
      // down one, so a downward move needs its index adjusted.
      const index =
        target.region === from.from && target.index > from.fromIndex
          ? target.index - 1
          : target.index;
      const next = { ...current, [from.from]: without };
      const destination = [...next[target.region]];
      destination.splice(index, 0, from.id);
      return { ...next, [target.region]: destination };
    });
  }, [drag, drop]);

  function startDrag(e: React.PointerEvent, id: SectionId, region: Region, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDrag({ id, from: region, fromIndex: index });
    setDrop({ region, index });
  }

  function hide(region: Region, id: SectionId) {
    setLayout((c) => ({
      ...c,
      [region]: c[region].filter((s) => s !== id),
      hidden: [...c.hidden, id],
    }));
  }

  function unhide(id: SectionId) {
    setLayout((c) => ({
      ...c,
      main: [...c.main, id],
      hidden: c.hidden.filter((s) => s !== id),
    }));
  }

  function cancel() {
    setLayout(committed.current);
    setEditing(false);
    setError("");
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
      // Adopt the server's normalized layout — pinned sections it re-inserted
      // and anything it dropped, so the page matches what was actually stored.
      committed.current = data.layout;
      setLayout(data.layout);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /** The bar showing where a released section would land. */
  function Indicator({ region, index }: { region: Region; index: number }) {
    if (!drag || !drop || drop.region !== region || drop.index !== index) return null;
    return <div aria-hidden className="h-1 rounded-full bg-[#E8B84B]" />;
  }

  function renderRegion(region: Region) {
    const ids = layout[region];
    return (
      <>
        <Indicator region={region} index={0} />
        {ids.map((id, i) => {
          const meta = SECTION_META[id];
          const content = sections[id];
          const isEmpty = empty.has(id);

          // Pinned sections (moderation UI) render as-is — they're not the
          // band's to arrange, so they get no overlay and no drag handle.
          if (meta.pinned) {
            // Still measured while editing — a pinned section occupies space,
            // so dropping "above" or "below" it has to resolve correctly.
            return (
              <Fragment key={id}>
                {editing ? <div data-section={id}>{content}</div> : content}
                <Indicator region={region} index={i + 1} />
              </Fragment>
            );
          }

          if (!editing) {
            return (
              <Fragment key={id}>
                {isEmpty ? null : content}
                <Indicator region={region} index={i + 1} />
              </Fragment>
            );
          }

          return (
            <Fragment key={id}>
              <div
                data-section={id}
                className={`relative rounded-md ring-1 transition ${
                  drag?.id === id
                    ? "opacity-40 ring-2 ring-[#E8B84B]"
                    : "ring-[#E8E0D0]/15 hover:ring-[#E8E0D0]/35"
                }`}
              >
                {isEmpty ? (
                  <div className="px-3 py-6 text-center text-sm italic text-[#E8E0D0]/35">
                    {meta.label} — nothing here yet
                  </div>
                ) : (
                  content
                )}

                {/* Capture layer: sits over the section (including any
                    iframe) so the whole thing is a drag surface. */}
                <div
                  onPointerDown={(e) => startDrag(e, id, region, i)}
                  style={{ touchAction: "none" }}
                  className="absolute inset-0 cursor-grab rounded-md bg-[#1a1a1a]/35 active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2 p-2">
                    <span className="rounded bg-[#1a1a1a]/85 px-2 py-1 text-xs font-medium text-[#E8E0D0]/90">
                      ⠿ {meta.label}
                    </span>
                    <button
                      type="button"
                      // Don't let the press that opens this button also pick
                      // the section up.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => hide(region, id)}
                      className="rounded bg-[#1a1a1a]/85 px-2 py-1 text-xs text-[#E8E0D0]/70 transition hover:text-[#E8E0D0]"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </div>
              <Indicator region={region} index={i + 1} />
            </Fragment>
          );
        })}
      </>
    );
  }

  return (
    <div>
      {!editing ? (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-md border border-[#E8E0D0]/25 px-3 py-1.5 text-sm font-medium text-[#E8E0D0]/85 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
          >
            ⠿ Edit layout
          </button>
        </div>
      ) : (
        <div className="sticky top-0 z-30 mb-5 -mx-2 flex flex-wrap items-center gap-3 rounded-md border border-[#E8B84B]/35 bg-[#1a1a1a]/95 px-3 py-2.5 backdrop-blur">
          <span className="text-sm font-medium text-[#E8B84B]">Editing layout</span>
          <span className="hidden text-xs text-[#E8E0D0]/50 sm:inline">
            Drag a section to move it{wideEnough ? ", including between columns" : ""}.{" "}
            {/* Dragging is mouse/touch only — this is the equivalent path for
                keyboard and screen-reader users. */}
            <Link
              href={`/bands/${slug}/customize`}
              className="underline decoration-[#E8E0D0]/30 underline-offset-2 transition hover:text-[#E8E0D0]/80"
            >
              Use the list editor
            </Link>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-md border border-[#E8E0D0]/25 px-3 py-1.5 text-sm text-[#E8E0D0]/75 transition hover:text-[#E8E0D0] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#E8E0D0]/85 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
        </div>
      )}

      <BandProfileShell
        photo={photo}
        header={header}
        main={
          <>
            {renderRegion("main")}
            {editing && layout.hidden.length > 0 && (
              <div className="rounded-md border border-dashed border-[#E8E0D0]/20 p-3">
                <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                  Hidden sections
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {layout.hidden.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => unhide(id)}
                      className="rounded-full border border-[#E8E0D0]/25 px-3 py-1 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                    >
                      + {SECTION_META[id].label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#E8E0D0]/35">
                  Adding one puts it at the bottom — drag it where you want from there.
                </p>
              </div>
            )}
          </>
        }
        sidebar={renderRegion("sidebar")}
      />
    </div>
  );
}
