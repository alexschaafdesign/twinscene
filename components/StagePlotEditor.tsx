"use client";

// The combined stage-plot editor: a drag-to-place canvas + palette on top, an
// inline-editable input-list table below, and an inline name at the top. No
// diagramming library — placed items are absolutely-positioned divs at 0..1
// fractional coordinates (the same coordinates the PDF renders from, via
// STAGE_CANVAS_ASPECT), so what you arrange here is what prints.
//
// Autosave: any change debounces a PATCH to the canEditBand-gated
// /api/stage-plots/[id] route, which replaces both child lists wholesale. A
// small saved/saving/error indicator stands in for a Save button.
//
// Dropping a palette item seeds input-list rows from the catalog, but the two
// lists aren't locked together after that — you can add a channel with no icon
// (e.g. "Talkback") or an icon with no channel.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  STAGE_PLOT_CATALOG,
  catalogItem,
  type CatalogItem,
} from "@/lib/stagePlotCatalog";
import StageSymbol, { symbolSize } from "@/components/StageSymbol";
import type { StagePlotItem, InputListItem } from "@/lib/stagePlots";

// Placed items snap to a light grid so a plot looks tidy without feeling
// locked — the visible canvas grid uses the same step.
const SNAP = 0.025;
const snap = (v: number) => Math.min(1, Math.max(0, Math.round(v / SNAP) * SNAP));

// Resize limits for the corner handles. Scale multiplies the symbol's natural
// size.
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.5;
const clampScale = (v: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));

type Item = {
  uid: string;
  item_type: string;
  label: string | null;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  use_house: boolean;
  xlr_out: boolean;
  notes: string | null;
};

type Input = {
  uid: string;
  channel_number: number | null;
  source: string;
  notes: string | null;
};

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `c${Date.now().toString(36)}-${uidCounter}`;
}

function toItem(row: StagePlotItem): Item {
  return {
    uid: `srv-${row.id}`,
    item_type: row.item_type,
    label: row.label,
    x: row.x,
    y: row.y,
    rotation: row.rotation,
    scale: row.scale ?? 1,
    use_house: row.use_house ?? false,
    xlr_out: row.xlr_out ?? false,
    notes: row.notes,
  };
}

function toInput(row: InputListItem): Input {
  return {
    uid: `srv-${row.id}`,
    channel_number: row.channel_number,
    source: row.source,
    notes: row.notes,
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function StagePlotEditor({
  plotId,
  initialName,
  initialItems,
  initialInputs,
}: {
  plotId: number;
  initialName: string;
  initialItems: StagePlotItem[];
  initialInputs: InputListItem[];
}) {
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<Item[]>(() => initialItems.map(toItem));
  // Live item count for the tap-cascade offset, readable from stable callbacks.
  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;
  const [inputs, setInputs] = useState<Input[]>(() => initialInputs.map(toInput));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const canvasRef = useRef<HTMLDivElement | null>(null);
  // The in-progress direct-manipulation gesture on a placed item, or null.
  // `move` tracks the pointer; `resize` measures against the item's center (in
  // px, captured at gesture start) so the maths stays simple.
  type Gesture =
    | { mode: "move"; uid: string }
    | {
        mode: "resize";
        uid: string;
        cx: number;
        cy: number;
        startDist: number;
        startScale: number;
      };
  const gestureRef = useRef<Gesture | null>(null);
  // A press that STARTED on a palette button but hasn't yet entered the canvas
  // to become a placed-item drag. `created` flips true once we spawn the item,
  // so pointerup knows a tap (create-at-default) is no longer needed.
  const pendingRef = useRef<{ cat: CatalogItem; created: boolean } | null>(null);

  // --- Autosave (debounced) ------------------------------------------------
  // Skip the initial render so opening a plot doesn't immediately re-save it.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stage-plots/${plotId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            items: items.map((it) => ({
              item_type: it.item_type,
              label: it.label,
              x: it.x,
              y: it.y,
              rotation: it.rotation,
              scale: it.scale,
              use_house: it.use_house,
              xlr_out: it.xlr_out,
              notes: it.notes,
            })),
            inputs: inputs.map((row) => ({
              channel_number: row.channel_number,
              source: row.source,
              notes: row.notes,
            })),
          }),
        });
        const data = await res.json().catch(() => null);
        setSaveState(res.ok && data?.success ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [name, items, inputs, plotId]);

  // --- Canvas placement + dragging ----------------------------------------
  // Spawn a catalog item at a fractional canvas position, select it, and seed
  // its input-list rows. Shared by tap-to-place, keyboard activation, and
  // drag-from-palette; returns the new uid so a drag can grab it immediately.
  const placeItem = useCallback((cat: CatalogItem, x: number, y: number): string => {
    const newItem: Item = {
      uid: uid(),
      item_type: cat.key,
      label: null,
      x: snap(x),
      y: snap(y),
      rotation: 0,
      scale: 1,
      use_house: false,
      xlr_out: false,
      notes: null,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedUid(newItem.uid);

    // Seed input-list rows from the catalog defaults (editable, not locked).
    if (cat.defaultInputs.length) {
      setInputs((prev) => [
        ...prev,
        ...cat.defaultInputs.map((d) => ({
          uid: uid(),
          channel_number: null,
          source: d.source,
          notes: null,
        })),
      ]);
    }
    return newItem.uid;
  }, []);

  // Tap / keyboard placement: drop at center-ish, cascading so a run of taps
  // doesn't stack exactly on one spot. Reads a live count ref so it stays
  // correct even when called from the captured window pointerup closure.
  const addFromPalette = useCallback(
    (cat: CatalogItem) => {
      placeItem(cat, 0.5, Math.min(0.75, 0.35 + (itemCountRef.current % 5) * 0.08));
    },
    [placeItem],
  );

  const pointFraction = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      // A palette drag spawns its item only once the pointer actually enters
      // the canvas — spawning earlier would clamp it to the canvas edge (the
      // pointer is still up over the palette), making the tile "jump" to the
      // border before your cursor gets there. A press that never enters the
      // canvas stays a tap, handled in onUp.
      const pending = pendingRef.current;
      if (pending && !pending.created) {
        const rect = canvasRef.current?.getBoundingClientRect();
        const inside =
          !!rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (inside) {
          const frac = pointFraction(e.clientX, e.clientY);
          if (frac) {
            const newUid = placeItem(pending.cat, frac.x, frac.y);
            pending.created = true;
            gestureRef.current = { mode: "move", uid: newUid };
            setDraggingUid(newUid);
          }
        }
      }

      const g = gestureRef.current;
      if (!g) return;

      if (g.mode === "move") {
        const frac = pointFraction(e.clientX, e.clientY);
        if (!frac) return;
        setItems((prev) =>
          prev.map((it) =>
            it.uid === g.uid ? { ...it, x: snap(frac.x), y: snap(frac.y) } : it,
          ),
        );
      } else {
        // resize: scale in proportion to how far the pointer is from center
        // relative to where the drag began.
        const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
        const scale = clampScale((g.startScale * dist) / (g.startDist || 1));
        setItems((prev) =>
          prev.map((it) => (it.uid === g.uid ? { ...it, scale } : it)),
        );
      }
    }
    function onUp() {
      // A palette press that never moved is a tap → default placement.
      const pending = pendingRef.current;
      if (pending) {
        if (!pending.created) addFromPalette(pending.cat);
        pendingRef.current = null;
      }
      if (gestureRef.current) {
        gestureRef.current = null;
        setDraggingUid(null);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pointFraction, placeItem, addFromPalette]);

  // Item center in client (px) coords — the pivot for the resize maths.
  function itemCenterPx(it: Item): { cx: number; cy: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { cx: rect.left + it.x * rect.width, cy: rect.top + it.y * rect.height };
  }

  function startMove(e: React.PointerEvent, itemUid: string) {
    e.preventDefault();
    gestureRef.current = { mode: "move", uid: itemUid };
    setDraggingUid(itemUid);
    setSelectedUid(itemUid);
  }

  function startResize(e: React.PointerEvent, it: Item) {
    e.preventDefault();
    e.stopPropagation();
    const center = itemCenterPx(it);
    if (!center) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startDist = Math.hypot(e.clientX - center.cx, e.clientY - center.cy);
    gestureRef.current = {
      mode: "resize",
      uid: it.uid,
      ...center,
      startDist,
      startScale: it.scale,
    };
    setDraggingUid(it.uid);
    setSelectedUid(it.uid);
  }

  function nudge(itemUid: string, dx: number, dy: number) {
    setItems((prev) =>
      prev.map((it) =>
        it.uid === itemUid
          ? {
              ...it,
              x: Math.min(1, Math.max(0, it.x + dx)),
              y: Math.min(1, Math.max(0, it.y + dy)),
            }
          : it,
      ),
    );
  }

  function updateItem(itemUid: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.uid === itemUid ? { ...it, ...patch } : it)));
  }

  function removeItem(itemUid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== itemUid));
    if (selectedUid === itemUid) setSelectedUid(null);
  }

  // --- Input list ----------------------------------------------------------
  function updateInput(rowUid: string, patch: Partial<Input>) {
    setInputs((prev) => prev.map((row) => (row.uid === rowUid ? { ...row, ...patch } : row)));
  }

  function addInputRow() {
    setInputs((prev) => [
      ...prev,
      {
        uid: uid(),
        channel_number: null,
        source: "",
        notes: null,
      },
    ]);
  }

  function removeInputRow(rowUid: string) {
    setInputs((prev) => prev.filter((row) => row.uid !== rowUid));
  }

  const selected = items.find((it) => it.uid === selectedUid) ?? null;

  const saveLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Couldn't save — changes are still here; edit again to retry.",
  };

  const field =
    "rounded border border-[#E8E0D0]/20 bg-transparent px-2 py-1 text-sm text-[#E8E0D0] outline-none focus:border-[#E8E0D0]/50";
  const smallBtn =
    "rounded border border-[#E8E0D0]/20 px-2 py-1 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]";

  return (
    <div className="space-y-8">
      {/* Name + save indicator */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Stage plot name"
          className="min-w-0 flex-1 border-b border-[#E8E0D0]/15 bg-transparent pb-1 text-2xl font-medium text-[#E8E0D0] outline-none focus:border-[#E8E0D0]/50 sm:text-3xl"
          maxLength={120}
        />
        <span
          className={`text-xs ${saveState === "error" ? "text-red-400" : "text-[#E8E0D0]/45"}`}
        >
          {saveLabel[saveState]}
        </span>
        <a
          href={`/api/stage-plots/${plotId}/pdf`}
          className="rounded-md bg-[#E8E0D0] px-3 py-1.5 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#E8E0D0]/85"
        >
          Export PDF
        </a>
      </div>

      {/* Palette */}
      <div>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
          Add to stage
        </h2>
        <div className="flex flex-wrap gap-2">
          {STAGE_PLOT_CATALOG.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onPointerDown={(e) => {
                // Begin a potential drag-to-place. Capture the pointer so a
                // touch drag off the button doesn't scroll the page, and so we
                // keep getting move/up even once the finger leaves the button.
                e.currentTarget.setPointerCapture?.(e.pointerId);
                pendingRef.current = { cat, created: false };
              }}
              // Pointer taps are handled in the window pointerup; this fires
              // only for keyboard activation (Enter/Space → detail 0).
              onClick={(e) => {
                if (e.detail === 0) addFromPalette(cat);
              }}
              style={{ touchAction: "none" }}
              className="flex touch-none items-center gap-2 rounded-lg border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.04)] px-3 py-2 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/40 hover:bg-[rgba(232,224,208,0.09)] hover:text-[#E8E0D0]"
            >
              <StageSymbol type={cat.key} size={22} style={{ color: "#E8E0D0", opacity: 0.85 }} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor: stage canvas (left) + selected-item details (right).
          Stacks to one column below lg. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left column: the stage canvas */}
        <div className="min-w-0 lg:flex-1">
        <div
          ref={canvasRef}
          onPointerDown={() => setSelectedUid(null)}
          style={{
            backgroundImage:
              "linear-gradient(rgba(232,224,208,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,224,208,0.05) 1px, transparent 1px)",
            backgroundSize: "10% 15%",
          }}
          className="relative aspect-[3/2] w-full max-w-3xl touch-none select-none overflow-hidden rounded-xl border border-[#E8E0D0]/20 bg-[rgba(232,224,208,0.03)] shadow-[inset_0_1px_0_rgba(232,224,208,0.06)]"
        >
          {/* Upstage / backline edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.03)] py-[3px] text-center text-[9px] uppercase tracking-[0.2em] text-[#E8E0D0]/30">
            Upstage · Backline
          </div>

          {items.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm italic text-[#E8E0D0]/35">
              Drag gear from above onto the grid — or tap it to drop it in, then drag to arrange.
            </p>
          )}

          {items.map((it) => {
            const cat = catalogItem(it.item_type);
            const isSel = it.uid === selectedUid;
            const isDragging = it.uid === draggingUid;
            // The 1.08 "lift" pop is for repositioning only — during a resize
            // the symbol is already changing, so don't fight it.
            const isMoving = isDragging && gestureRef.current?.mode === "move";
            const size = symbolSize(it.item_type) * it.scale;
            return (
              <div
                key={it.uid}
                role="button"
                tabIndex={0}
                aria-label={`${it.label || cat.label}. Drag to move; arrow keys nudge, [ and ] resize.`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startMove(e, it.uid);
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : SNAP;
                  if (e.key === "ArrowLeft") { e.preventDefault(); nudge(it.uid, -step, 0); }
                  else if (e.key === "ArrowRight") { e.preventDefault(); nudge(it.uid, step, 0); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); nudge(it.uid, 0, -step); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); nudge(it.uid, 0, step); }
                  else if (e.key === "[") { e.preventDefault(); updateItem(it.uid, { scale: clampScale(it.scale - 0.1) }); }
                  else if (e.key === "]") { e.preventDefault(); updateItem(it.uid, { scale: clampScale(it.scale + 0.1) }); }
                  else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); removeItem(it.uid); }
                }}
                style={{
                  left: `${it.x * 100}%`,
                  top: `${it.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${isMoving ? 1.08 : 1})`,
                  zIndex: isDragging ? 30 : isSel ? 20 : 10,
                  transition: isDragging ? "none" : "transform 120ms ease",
                }}
                className={`group absolute flex cursor-grab flex-col items-center rounded-lg px-1.5 py-1 text-[#E8E0D0] outline-none active:cursor-grabbing ${
                  isSel
                    ? "bg-[rgba(232,224,208,0.10)] ring-1 ring-[#E8B84B]/70"
                    : "hover:bg-[rgba(232,224,208,0.06)] focus-visible:ring-1 focus-visible:ring-[#E8E0D0]/40"
                } ${isDragging ? "shadow-xl shadow-black/40" : ""}`}
              >
                <span
                  className="relative inline-block leading-none"
                  style={{ width: size, height: size }}
                >
                  <span
                    className="absolute inset-0 inline-block leading-none"
                    style={{ transform: `rotate(${it.rotation}deg)` }}
                  >
                    <StageSymbol type={it.item_type} size={size} />
                  </span>

                  {/* Resize grips at each corner — only on the selected item.
                      Dragging any corner scales the symbol from its center, so
                      all four behave identically; the diagonal arrows just read
                      as the familiar "resize" affordance. */}
                  {isSel &&
                    (
                      [
                        { key: "tl", pos: "-top-2 -left-2", cursor: "cursor-nwse-resize", arrow: "⤡" },
                        { key: "tr", pos: "-top-2 -right-2", cursor: "cursor-nesw-resize", arrow: "⤢" },
                        { key: "bl", pos: "-bottom-2 -left-2", cursor: "cursor-nesw-resize", arrow: "⤢" },
                        { key: "br", pos: "-bottom-2 -right-2", cursor: "cursor-nwse-resize", arrow: "⤡" },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        aria-label="Resize"
                        title="Drag to resize"
                        onPointerDown={(e) => startResize(e, it)}
                        style={{ touchAction: "none" }}
                        className={`absolute ${c.pos} ${c.cursor} flex h-4 w-4 items-center justify-center rounded-sm border border-[#E8B84B]/70 bg-[#1a1a1a] text-[9px] leading-none text-[#E8B84B]`}
                      >
                        {c.arrow}
                      </button>
                    ))}
                </span>
                <span className="mt-1 max-w-[7rem] truncate text-[10px] font-medium leading-tight text-[#E8E0D0]/85">
                  {it.label || cat.label}
                </span>
                {it.use_house && cat.houseLabel && (
                  <span className="max-w-[7rem] truncate text-[9px] leading-tight text-[#E8B84B]/85">
                    {cat.houseLabel} OK
                  </span>
                )}
                {it.xlr_out && cat.xlrOut && (
                  <span className="max-w-[7rem] truncate text-[9px] leading-tight text-[#E8B84B]/85">
                    {cat.xlrOut.note}
                  </span>
                )}
              </div>
            );
          })}

          {/* Front of stage / audience edge — warm accent so orientation reads
              at a glance. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E8B84B]/60 to-transparent" />
            <div className="bg-gradient-to-t from-[#E8B84B]/10 to-transparent py-1 text-center text-[9px] uppercase tracking-[0.25em] text-[#E8B84B]/70">
              Front of stage · Audience
            </div>
          </div>
        </div>
        </div>

        {/* Right column: details for the selected item */}
        <div className="w-full lg:w-72 lg:flex-shrink-0">
        {selected ? (
          <div className="space-y-3 rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.04)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
                {catalogItem(selected.item_type).label}
              </span>
              <button type="button" className={smallBtn} onClick={() => removeItem(selected.uid)}>
                Remove
              </button>
            </div>
            <label className="block text-xs text-[#E8E0D0]/60">
              Label
              <input
                value={selected.label ?? ""}
                onChange={(e) => updateItem(selected.uid, { label: e.target.value || null })}
                placeholder={catalogItem(selected.item_type).label}
                className={`mt-1 block w-full ${field}`}
                maxLength={500}
              />
            </label>
            {catalogItem(selected.item_type).houseLabel && (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-[#E8E0D0]/70">
                <input
                  type="checkbox"
                  checked={selected.use_house}
                  onChange={(e) =>
                    updateItem(selected.uid, { use_house: e.target.checked })
                  }
                  className="mt-0.5 accent-[#E8B84B]"
                />
                <span>
                  Will use the{" "}
                  <span className="text-[#E8E0D0]/90">
                    {catalogItem(selected.item_type).houseLabel}
                  </span>{" "}
                  if the venue provides one
                </span>
              </label>
            )}
            {catalogItem(selected.item_type).xlrOut && (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-[#E8E0D0]/70">
                <input
                  type="checkbox"
                  checked={selected.xlr_out}
                  onChange={(e) =>
                    updateItem(selected.uid, { xlr_out: e.target.checked })
                  }
                  className="mt-0.5 accent-[#E8B84B]"
                />
                <span>{catalogItem(selected.item_type).xlrOut!.question}</span>
              </label>
            )}
            <label className="block text-xs text-[#E8E0D0]/60">
              Notes
              <textarea
                value={selected.notes ?? ""}
                onChange={(e) => updateItem(selected.uid, { notes: e.target.value || null })}
                rows={2}
                className={`mt-1 block w-full ${field}`}
                maxLength={500}
              />
            </label>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[#E8E0D0]/15 px-4 py-6 text-sm italic text-[#E8E0D0]/40">
            Select an item on the stage to edit its label, size, and notes.
          </p>
        )}
        </div>
      </div>

      {/* Input list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Input list
          </h2>
          <button type="button" className={smallBtn} onClick={addInputRow}>
            + Add channel
          </button>
        </div>

        {inputs.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#E8E0D0]/15 px-4 py-5 text-sm italic text-[#E8E0D0]/40">
            No channels yet. Add gear above (it seeds rows here) or add a channel manually.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                  <th className="py-2 pr-2 font-medium">Source</th>
                  <th className="py-2 pr-2 font-medium">Notes</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {inputs.map((row) => (
                  <tr key={row.uid} className="border-t border-[#E8E0D0]/10">
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.source}
                        onChange={(e) => updateInput(row.uid, { source: e.target.value })}
                        className={`w-full ${field}`}
                        maxLength={500}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.notes ?? ""}
                        onChange={(e) => updateInput(row.uid, { notes: e.target.value || null })}
                        className={`w-full ${field}`}
                        maxLength={500}
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        aria-label="Remove channel"
                        className={smallBtn}
                        onClick={() => removeInputRow(row.uid)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-[#E8E0D0]/40">
        Changes save automatically. Select an item, then drag any corner handle to resize it — or
        use the arrow keys to nudge (Shift for bigger steps) and “[” / “]” to resize.
      </p>
    </div>
  );
}
