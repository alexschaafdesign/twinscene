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
// SMOOTHNESS — the reason this file looks the way it does:
//   * A drag doesn't start until the pointer travels DRAG_THRESHOLD, so a
//     plain click never disturbs the page.
//   * The drop indicator and the floating label are positioned `fixed` and
//     written directly to the DOM from an animation frame. Nothing about a
//     drag goes through React state, so the profile — iframes and all — does
//     not re-render while you move the pointer. An in-flow indicator would
//     reflow the page on every target change, which also moves the very
//     midpoints the hit-test reads, making the whole thing oscillate.
//   * Positions are recomputed each frame from live rects, so edge-scrolling
//     stays in sync for free.
//
// Not accessible — dragging is mouse/touch only. /bands/<slug>/customize is
// the keyboard and screen-reader path to the same layout, and stays supported.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BandProfileShell from "@/components/BandProfileShell";
import SectionInspector from "@/components/SectionInspector";
import {
  REGIONS,
  SECTION_META,
  type BandProfileLayout,
  type Region,
  type SectionId,
} from "@/lib/bandProfileLayout";
import { SECTION_EDIT, type SectionValues } from "@/lib/bandProfileFields";
import type { ReactNode } from "react";

type Press = { id: SectionId; from: Region; fromIndex: number; x: number; y: number };
type Drop = { region: Region; index: number; top: number; left: number; width: number };

/** Pointer travel before a press becomes a drag. Below this it's a click. */
const DRAG_THRESHOLD = 6;
/** Distance from the viewport edge at which a drag scrolls the page. */
const SCROLL_EDGE = 90;
const SCROLL_SPEED = 14;

export default function ProfileLayoutEditor({
  slug,
  initialLayout,
  sections,
  emptyIds,
  fieldValues,
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
  /** Current stored values for each editable section, to prefill the
   * inspector. Only sections with an edit schema need an entry. */
  fieldValues: Partial<Record<SectionId, SectionValues>>;
  photo: ReactNode;
  header: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  /** Only set once a press becomes a real drag — drives the lifted styling.
   * Nothing else about a drag lives in React state. */
  const [dragging, setDragging] = useState<SectionId | null>(null);
  /** Section whose inspector is open — a click (not a drag) opens it. */
  const [inspecting, setInspecting] = useState<SectionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const committed = useRef(initialLayout);
  const press = useRef<Press | null>(null);
  const active = useRef(false);
  const dropRef = useRef<Drop | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  // Mirrors `layout` so the delegated pointer handlers read the current
  // arrangement without the listener effect re-registering on every change.
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

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

  /** Where the carried section would land, plus the exact bar geometry for it.
   * Both come out of one pass over the live rects so they can never disagree. */
  const locate = useCallback(
    (p: Press): Drop | null => {
      const { x, y } = pointer.current;
      let best: { region: Region; el: Element; distance: number } | null = null;

      for (const region of REGIONS) {
        if (!wideEnough && region !== p.from) continue;
        const el = document.querySelector(`[data-region="${region}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const distance = Math.hypot(dx, dy);
        if (!best || distance < best.distance) best = { region, el, distance };
      }
      if (!best) return null;

      const { region, el: container } = best;
      const box = container.getBoundingClientRect();
      const ids = layoutRef.current[region];

      let index = ids.length;
      let top = box.top;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === p.id) continue;
        const el = container.querySelector(`[data-section="${ids[i]}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          top = r.top - 6;
          return { region, index, top, left: box.left, width: box.width };
        }
        top = r.bottom + 6;
      }
      return { region, index, top, left: box.left, width: box.width };
    },
    [wideEnough],
  );

  /** Paint the indicator bar and the floating label straight to the DOM. */
  const paint = useCallback((drop: Drop | null) => {
    const bar = indicatorRef.current;
    if (bar) {
      if (drop) {
        bar.style.display = "block";
        bar.style.transform = `translate3d(${drop.left}px, ${drop.top}px, 0)`;
        bar.style.width = `${drop.width}px`;
      } else {
        bar.style.display = "none";
      }
    }
    const ghost = ghostRef.current;
    if (ghost) {
      const { x, y } = pointer.current;
      ghost.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    }
  }, []);

  // One listener set for the whole editing session. Everything a drag touches
  // is a ref, so this never re-registers mid-gesture and never re-renders.
  useEffect(() => {
    if (!editing) return;

    function finish(commit: boolean) {
      const p = press.current;
      const wasDrag = active.current;
      // Normally the frame loop has already resolved a target. A drag fast
      // enough to release before any frame ran (a flick, or a synthetic
      // event burst) would otherwise drop nothing, so resolve it here from
      // the final pointer position.
      const target = p && wasDrag ? (dropRef.current ?? locate(p)) : null;
      press.current = null;
      active.current = false;
      dropRef.current = null;
      paint(null);
      const ghost = ghostRef.current;
      if (ghost) ghost.style.display = "none";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragging(null);

      // A press that released without ever becoming a drag is a click: open
      // that section's inspector instead of moving anything. Only sections
      // with an edit schema respond — the rest aren't wired for in-place
      // editing yet, and a dead panel is worse than an inert click.
      if (commit && p && !wasDrag) {
        if (SECTION_EDIT[p.id]) setInspecting(p.id);
        return;
      }

      if (!commit || !p || !target) return;

      // A drop back into the slot it came from changes nothing.
      if (
        target.region === p.from &&
        (target.index === p.fromIndex || target.index === p.fromIndex + 1)
      ) {
        return;
      }

      setLayout((current) => {
        const without = current[p.from].filter((s) => s !== p.id);
        // Removing the section first shifts later slots in that same region
        // down one, so a downward move needs its index adjusted.
        const index =
          target.region === p.from && target.index > p.fromIndex
            ? target.index - 1
            : target.index;
        const next = { ...current, [p.from]: without };
        const destination = [...next[target.region]];
        destination.splice(index, 0, p.id);
        return { ...next, [target.region]: destination };
      });
    }

    // Delegated rather than a per-section handler: the drag surface is
    // identified by data attributes, so no closure is rebuilt per render and
    // the whole gesture stays out of React.
    function onDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("[data-no-drag]")) return;
      const handle = target.closest("[data-drag-handle]");
      if (!handle) return;

      const id = handle.getAttribute("data-drag-handle") as SectionId;
      const region = handle.closest("[data-region]")?.getAttribute("data-region") as
        | Region
        | undefined;
      if (!region) return;
      const fromIndex = layoutRef.current[region].indexOf(id);
      if (fromIndex === -1) return;

      pointer.current = { x: e.clientX, y: e.clientY };
      press.current = { id, from: region, fromIndex, x: e.clientX, y: e.clientY };
    }

    function onMove(e: PointerEvent) {
      const p = press.current;
      if (!p) return;
      pointer.current = { x: e.clientX, y: e.clientY };

      if (!active.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
        active.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        const ghost = ghostRef.current;
        if (ghost) ghost.style.display = "block";
        setDragging(p.id);
      }
      e.preventDefault();
    }

    function onUp() {
      finish(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish(false);
    }

    // Recomputed per frame rather than per pointermove: it keeps the bar
    // correct while the page edge-scrolls under a stationary pointer, and
    // naturally coalesces bursts of pointer events into one update.
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const p = press.current;
      if (!p || !active.current) return;

      const y = pointer.current.y;
      if (y < SCROLL_EDGE) window.scrollBy(0, -SCROLL_SPEED);
      else if (y > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_SPEED);

      dropRef.current = locate(p);
      paint(dropRef.current);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [editing, locate, paint]);

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

  function renderRegion(region: Region) {
    return layout[region].map((id) => {
      const meta = SECTION_META[id];
      const content = sections[id];
      const isEmpty = empty.has(id);

      // Pinned sections (moderation UI) render as-is — they're not the band's
      // to arrange — but are still measured, so dropping above or below one
      // resolves correctly.
      if (meta.pinned) {
        return (
          <Fragment key={id}>
            {editing ? <div data-section={id}>{content}</div> : content}
          </Fragment>
        );
      }

      if (!editing) return <Fragment key={id}>{isEmpty ? null : content}</Fragment>;

      return (
        <div
          key={id}
          data-section={id}
          className={`relative rounded-md ring-1 transition-[opacity,box-shadow] duration-150 ${
            dragging === id
              ? "opacity-30 ring-2 ring-[#E8B84B]"
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

          {/* Capture layer: sits over the section (including any iframe) so
              the whole thing is a drag surface. */}
          <div
            data-drag-handle={id}
            style={{ touchAction: "none" }}
            className="absolute inset-0 cursor-grab rounded-md bg-[#1a1a1a]/35 active:cursor-grabbing"
          >
            <div className="flex items-start justify-between gap-2 p-2">
              <span className="rounded bg-[#1a1a1a]/85 px-2 py-1 text-xs font-medium text-[#E8E0D0]/90">
                ⠿ {meta.label}
                {SECTION_EDIT[id] && (
                  <span className="ml-1.5 text-[#E8E0D0]/45">· tap to edit</span>
                )}
              </span>
              <button
                type="button"
                // Excluded from the delegated drag surface, so pressing it
                // never arms a drag.
                data-no-drag
                onClick={() => hide(region, id)}
                className="rounded bg-[#1a1a1a]/85 px-2 py-1 text-xs text-[#E8E0D0]/70 transition hover:text-[#E8E0D0]"
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <div>
      {/* Drag chrome. Both are fixed and driven straight from the animation
          frame, so they never participate in layout or trigger a render. */}
      <div
        ref={indicatorRef}
        aria-hidden
        style={{ display: "none", top: 0, left: 0 }}
        className="pointer-events-none fixed z-40 h-1 rounded-full bg-[#E8B84B] shadow-[0_0_8px_rgba(232,184,75,0.6)]"
      />
      <div
        ref={ghostRef}
        aria-hidden
        style={{ display: "none", top: 0, left: 0 }}
        className="pointer-events-none fixed z-50 rounded bg-[#E8B84B] px-2.5 py-1 text-xs font-medium text-[#1a1a1a] shadow-lg"
      >
        {dragging ? SECTION_META[dragging].label : ""}
      </div>

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

      {inspecting && (
        <SectionInspector
          // Remount per section so the form state resets to that section's
          // values without an effect.
          key={inspecting}
          slug={slug}
          section={inspecting}
          initialValues={fieldValues[inspecting] ?? {}}
          onClose={() => setInspecting(null)}
          // Re-render the server-side section with its new content, in place,
          // while staying in edit mode.
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
