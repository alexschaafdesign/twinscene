"use client";

// The inspector for the in-place profile editor: click a section (rather than
// drag it) and its editable fields open here.
//
// A side panel on desktop, a bottom sheet on mobile — the canvas+inspector
// pattern Shopify/Squarespace/Webflow use, chosen over an anchored popover
// because sections are full-width and tall and a popover would have nowhere
// good to sit. What the panel shows is entirely driven by the section's field
// schema (lib/bandProfileFields.ts); this component renders any schema and
// knows nothing section-specific.

import { useEffect, useState } from "react";
import { SECTION_EDIT, type SectionValues, type LinkListItem } from "@/lib/bandProfileFields";
import { SECTION_META, type SectionId } from "@/lib/bandProfileLayout";

export default function SectionInspector({
  slug,
  section,
  initialValues,
  onClose,
  onSaved,
}: {
  slug: string;
  section: SectionId;
  /** Current stored values for this section's fields, to prefill the form. */
  initialValues: SectionValues;
  onClose: () => void;
  /** Called after a successful save so the editor can refresh the profile. */
  onSaved: () => void;
}) {
  const schema = SECTION_EDIT[section];
  const meta = SECTION_META[section];

  const [values, setValues] = useState<SectionValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Escape closes, matching the drag editor's own Escape-to-cancel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const editable = !!schema && schema.fields.length > 0;

  async function save() {
    if (!editable) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/bands/${slug}/section`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, values }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't save. Try again.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Scrim — click-away closes. */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${meta.label}`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-[#E8E0D0]/15 bg-[#1a1a1a] p-5 shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[360px] sm:rounded-none sm:border-l sm:border-t-0"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#E8E0D0]">{meta.label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
          >
            {/* ti-x */}
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {schema?.note && (
          <p className="mb-4 text-sm leading-relaxed text-[#E8E0D0]/55">{schema.note}</p>
        )}

        {!editable ? (
          !schema?.note && (
            <p className="text-sm leading-relaxed text-[#E8E0D0]/60">
              This section isn&apos;t editable here.
            </p>
          )
        ) : (
          <div className="space-y-4">
            {schema.fields.map((field) => {
              const str = typeof values[field.key] === "string" ? (values[field.key] as string) : "";
              const set = (val: unknown) => setValues((v) => ({ ...v, [field.key]: val }));

              if (field.type === "linkList") {
                const items = Array.isArray(values[field.key])
                  ? (values[field.key] as LinkListItem[])
                  : [];
                const update = (i: number, patch: Partial<LinkListItem>) =>
                  set(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
                const remove = (i: number) => set(items.filter((_, j) => j !== i));
                const add = () => set([...items, { url: "", label: "" }]);

                return (
                  <div key={field.key}>
                    <span className="mb-1.5 block text-sm font-medium text-[#E8E0D0]/75">
                      {field.label}
                    </span>
                    <div className="space-y-3">
                      {items.map((item, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-2.5"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs text-[#E8E0D0]/45">
                              {field.itemNoun} {i + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => remove(i)}
                              className="text-xs text-[#E8E0D0]/50 transition hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            type="text"
                            value={item.url}
                            onChange={(e) => update(i, { url: e.target.value })}
                            placeholder="https://…"
                            className="mb-2 w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-3 py-2 text-sm text-[#E8E0D0] outline-none transition focus:border-[#E8E0D0]/45"
                          />
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => update(i, { label: e.target.value })}
                            placeholder="Label (optional)"
                            className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-3 py-2 text-sm text-[#E8E0D0] outline-none transition focus:border-[#E8E0D0]/45"
                          />
                        </div>
                      ))}
                    </div>
                    {items.length < field.max && (
                      <button
                        type="button"
                        onClick={add}
                        className="mt-2 rounded-md border border-dashed border-[#E8E0D0]/25 px-3 py-1.5 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                      >
                        + Add {field.itemNoun}
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#E8E0D0]/75">
                    {field.label}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      value={str}
                      onChange={(e) => set(e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      rows={field.rows ?? 5}
                      className="w-full resize-y rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-3 py-2 text-sm text-[#E8E0D0] outline-none transition focus:border-[#E8E0D0]/45"
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={str}
                      onChange={(e) => set(e.target.value)}
                      className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-3 py-2 text-sm text-[#E8E0D0] outline-none transition focus:border-[#E8E0D0]/45"
                    >
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={str}
                      onChange={(e) => set(e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-3 py-2 text-sm text-[#E8E0D0] outline-none transition focus:border-[#E8E0D0]/45"
                    />
                  )}
                  {field.type !== "select" && field.maxLength && (
                    <span className="mt-1 block text-right text-xs text-[#E8E0D0]/35">
                      {str.length}/{field.maxLength}
                    </span>
                  )}
                </label>
              );
            })}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#E8E0D0]/85 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-[#E8E0D0]/25 px-4 py-2 text-sm text-[#E8E0D0]/75 transition hover:text-[#E8E0D0] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
