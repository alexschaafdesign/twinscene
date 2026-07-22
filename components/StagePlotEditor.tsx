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
import type { StagePlotItem, InputListItem } from "@/lib/stagePlots";

type Item = {
  uid: string;
  item_type: string;
  label: string | null;
  x: number;
  y: number;
  rotation: number;
  notes: string | null;
};

type Input = {
  uid: string;
  channel_number: number | null;
  source: string;
  mic_or_di: string | null;
  stand: string | null;
  phantom_power: boolean;
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
    notes: row.notes,
  };
}

function toInput(row: InputListItem): Input {
  return {
    uid: `srv-${row.id}`,
    channel_number: row.channel_number,
    source: row.source,
    mic_or_di: row.mic_or_di,
    stand: row.stand,
    phantom_power: row.phantom_power,
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
  const [inputs, setInputs] = useState<Input[]>(() => initialInputs.map(toInput));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragUidRef = useRef<string | null>(null);

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
              notes: it.notes,
            })),
            inputs: inputs.map((row) => ({
              channel_number: row.channel_number,
              source: row.source,
              mic_or_di: row.mic_or_di,
              stand: row.stand,
              phantom_power: row.phantom_power,
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
  function addFromPalette(cat: CatalogItem) {
    const newItem: Item = {
      uid: uid(),
      item_type: cat.key,
      label: null,
      // Cascade new items slightly so several don't stack exactly.
      x: 0.5,
      y: Math.min(0.75, 0.35 + (items.length % 5) * 0.08),
      rotation: 0,
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
          mic_or_di: d.micOrDi ?? null,
          stand: d.stand ?? null,
          phantom_power: d.phantomPower ?? false,
          notes: null,
        })),
      ]);
    }
  }

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
      if (!dragUidRef.current) return;
      const frac = pointFraction(e.clientX, e.clientY);
      if (!frac) return;
      const target = dragUidRef.current;
      setItems((prev) =>
        prev.map((it) => (it.uid === target ? { ...it, x: frac.x, y: frac.y } : it)),
      );
    }
    function onUp() {
      dragUidRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pointFraction]);

  function startDrag(e: React.PointerEvent, itemUid: string) {
    e.preventDefault();
    dragUidRef.current = itemUid;
    setSelectedUid(itemUid);
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
        mic_or_di: null,
        stand: null,
        phantom_power: false,
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
              onClick={() => addFromPalette(cat)}
              className="flex items-center gap-1.5 rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.04)] px-2.5 py-1.5 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]"
            >
              <span aria-hidden>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div>
        <div
          ref={canvasRef}
          onPointerDown={() => setSelectedUid(null)}
          className="relative aspect-[3/2] w-full max-w-3xl touch-none select-none overflow-hidden rounded-md border border-[#E8E0D0]/20 bg-[rgba(232,224,208,0.03)]"
        >
          {items.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm italic text-[#E8E0D0]/35">
              Click gear above to place it here, then drag to arrange.
            </p>
          )}
          {items.map((it) => {
            const cat = catalogItem(it.item_type);
            const isSel = it.uid === selectedUid;
            return (
              <div
                key={it.uid}
                role="button"
                tabIndex={0}
                aria-label={`${it.label || cat.label}, drag to move`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag(e, it.uid);
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : 0.02;
                  if (e.key === "ArrowLeft") { e.preventDefault(); nudge(it.uid, -step, 0); }
                  else if (e.key === "ArrowRight") { e.preventDefault(); nudge(it.uid, step, 0); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); nudge(it.uid, 0, -step); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); nudge(it.uid, 0, step); }
                  else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); removeItem(it.uid); }
                }}
                style={{
                  left: `${it.x * 100}%`,
                  top: `${it.y * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${it.rotation}deg)`,
                }}
                className={`absolute flex cursor-grab flex-col items-center rounded-md border px-2 py-1 text-center active:cursor-grabbing ${
                  isSel
                    ? "border-[#E8E0D0] bg-[rgba(232,224,208,0.16)]"
                    : "border-[#E8E0D0]/30 bg-[rgba(232,224,208,0.08)]"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {cat.icon}
                </span>
                <span className="mt-0.5 max-w-[6rem] truncate text-[10px] leading-tight text-[#E8E0D0]/85">
                  {it.label || cat.label}
                </span>
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-[#E8E0D0]/20 py-0.5 text-center text-[10px] uppercase tracking-widest text-[#E8E0D0]/40">
            Front of stage · Audience
          </div>
        </div>

        {/* Selected item properties */}
        {selected && (
          <div className="mt-3 max-w-3xl space-y-3 rounded-md border border-[#E8E0D0]/15 bg-[rgba(232,224,208,0.04)] p-3">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#E8E0D0]/60">Rotation</span>
              <button
                type="button"
                className={smallBtn}
                onClick={() =>
                  updateItem(selected.uid, { rotation: (selected.rotation + 45) % 360 })
                }
              >
                Rotate 45° ({selected.rotation}°)
              </button>
            </div>
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
        )}
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
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                  <th className="w-12 py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Source</th>
                  <th className="py-2 pr-2 font-medium">Mic / DI</th>
                  <th className="py-2 pr-2 font-medium">Stand</th>
                  <th className="w-14 py-2 pr-2 text-center font-medium">48V</th>
                  <th className="py-2 pr-2 font-medium">Notes</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {inputs.map((row, i) => (
                  <tr key={row.uid} className="border-t border-[#E8E0D0]/10">
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={row.channel_number ?? ""}
                        placeholder={String(i + 1)}
                        onChange={(e) =>
                          updateInput(row.uid, {
                            channel_number:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className={`w-12 ${field}`}
                      />
                    </td>
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
                        value={row.mic_or_di ?? ""}
                        onChange={(e) =>
                          updateInput(row.uid, { mic_or_di: e.target.value || null })
                        }
                        className={`w-full ${field}`}
                        maxLength={500}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.stand ?? ""}
                        onChange={(e) => updateInput(row.uid, { stand: e.target.value || null })}
                        className={`w-full ${field}`}
                        maxLength={500}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.phantom_power}
                        aria-label="Phantom power"
                        onChange={(e) =>
                          updateInput(row.uid, { phantom_power: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#E8E0D0]"
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
        Changes save automatically. Use the arrow keys to nudge a selected item; Shift for bigger
        steps. The channel numbering shown in the PDF falls back to row order when the “#” is blank.
      </p>
    </div>
  );
}
