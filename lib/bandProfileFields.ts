// What each profile section exposes for in-place editing.
//
// The layout editor turns a click on a section (as opposed to a drag) into an
// inspector panel. This module is the single declaration of what that panel
// shows: one small field schema per editable section. Adding editing to a
// section is a declaration here plus a case in the section PATCH route
// (app/api/bands/[slug]/section/route.ts) that writes those keys — no new UI.
//
// You (the site) decide what bands can edit by what appears here. A section
// absent from SECTION_EDIT isn't editable in place at all; a section present
// but with no `fields` is shown as read-only with its `note` (e.g. shows,
// whose data is owned by the shared listings table, not the band).

import type { SectionId } from "./bandProfileLayout";

export type SectionField =
  | {
      key: string;
      type: "text" | "textarea";
      label: string;
      placeholder?: string;
      maxLength?: number;
      rows?: number;
    };

export type SectionEditSchema = {
  /** Fields the inspector renders. Empty means read-only (show `note`). */
  fields: SectionField[];
  /** Explains where the data lives when it isn't the band's to edit here. */
  note?: string;
};

export const SECTION_EDIT: Partial<Record<SectionId, SectionEditSchema>> = {
  bio: {
    fields: [
      {
        key: "bio",
        type: "textarea",
        label: "Bio",
        rows: 7,
        maxLength: 2000,
        placeholder: "Tell people who you are…",
      },
    ],
  },
  // Present-but-read-only: shows come from venue listings and the scrapers
  // (the shared shows table), so a band can position the section but not
  // rewrite its contents. Saying so beats a dead click.
  shows: {
    fields: [],
    note: "Upcoming shows are pulled from venue listings, so they can't be edited here.",
  },
};

/** The subset of a section's stored values the inspector needs to prefill.
 * Keyed by field `key`. Only editable sections have an entry. */
export type SectionValues = Record<string, string>;
