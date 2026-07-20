"use client";

// The editor's view of their own band profile: the real page, plus a small
// Edit pencil on each editable section. Click one and its inspector opens
// (SectionInspector); save re-renders that section in place. No mode, no drag —
// the profile looks exactly as visitors see it, with editing one click away.
//
// The sections arrive already rendered from the server (BandProfile builds
// them and passes them in as `sections`), so this only decorates finished
// nodes with an affordance and holds the open-inspector state. It never needs
// the band's data.
//
// Layout order/visibility still comes from the stored profile_layout (applied
// server-side, before this) — rearranging just isn't editable from here right
// now. Which sections a band can edit, and with what fields, is declared in
// lib/bandProfileFields.ts (SECTION_EDIT).

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import BandProfileShell from "@/components/BandProfileShell";
import SectionInspector from "@/components/SectionInspector";
import { SECTION_EDIT, type SectionValues } from "@/lib/bandProfileFields";
import {
  SECTION_META,
  type BandProfileLayout,
  type Region,
  type SectionId,
} from "@/lib/bandProfileLayout";

/** A section is editable in place when it declares at least one field. A
 * present-but-fieldless schema (e.g. shows, read-only) is not. */
function isEditable(id: SectionId): boolean {
  return (SECTION_EDIT[id]?.fields.length ?? 0) > 0;
}

/** ti-pencil (Tabler). */
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16v4" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export default function EditableProfile({
  slug,
  layout,
  sections,
  emptyIds,
  fieldValues,
  photo,
  header,
}: {
  slug: string;
  layout: BandProfileLayout;
  /** Every section, server-rendered, keyed by id. */
  sections: Partial<Record<SectionId, ReactNode>>;
  /** Sections that would render nothing right now. An editable one still gets
   * an "add" prompt so its content can be created; others render nothing. */
  emptyIds: SectionId[];
  /** Current stored values per editable section, to prefill the inspector. */
  fieldValues: Partial<Record<SectionId, SectionValues>>;
  photo: ReactNode;
  header: ReactNode;
}) {
  const router = useRouter();
  const [inspecting, setInspecting] = useState<SectionId | null>(null);
  const empty = new Set(emptyIds);

  /** Wrap an editable section with a hover/focus Edit pencil. */
  function withPencil(id: SectionId, body: ReactNode) {
    const label = SECTION_META[id].label;
    return (
      <div key={id} className="group relative rounded-md transition-shadow focus-within:ring-1 focus-within:ring-[#E8E0D0]/25 hover:ring-1 hover:ring-[#E8E0D0]/15">
        {body}
        <button
          type="button"
          onClick={() => setInspecting(id)}
          aria-label={`Edit ${label}`}
          // Always visible on touch (no hover); on ≥sm it fades in on hover or
          // keyboard focus so the read view stays clean.
          className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-md border border-[#E8E0D0]/20 bg-[#1a1a1a]/85 px-2 py-1 text-xs font-medium text-[#E8E0D0]/80 backdrop-blur transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0] focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <PencilIcon />
          Edit
        </button>
      </div>
    );
  }

  function renderRegion(region: Region) {
    return layout[region].map((id) => {
      const meta = SECTION_META[id];
      const content = sections[id];
      const editable = isEditable(id);
      const isEmpty = empty.has(id);

      // Pinned (moderation UI) and non-editable sections render exactly as a
      // visitor sees them — nothing if empty.
      if (meta.pinned || !editable) {
        return isEmpty && !meta.pinned ? null : <div key={id}>{content}</div>;
      }

      // Editable but empty: an "add" prompt in place of the absent content, so
      // a band can create it. Visitors never see this (they aren't editors).
      if (isEmpty) {
        return (
          <button
            key={id}
            type="button"
            onClick={() => setInspecting(id)}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-[#E8E0D0]/20 px-3 py-4 text-left text-sm text-[#E8E0D0]/45 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]/70"
          >
            <PencilIcon />
            Add {meta.label.toLowerCase()}
          </button>
        );
      }

      return withPencil(id, content);
    });
  }

  return (
    <div>
      <BandProfileShell
        photo={photo}
        header={header}
        main={renderRegion("main")}
        sidebar={renderRegion("sidebar")}
      />

      {inspecting && (
        <SectionInspector
          key={inspecting}
          slug={slug}
          section={inspecting}
          initialValues={fieldValues[inspecting] ?? {}}
          onClose={() => setInspecting(null)}
          // Re-render the section server-side with its new content, in place.
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
