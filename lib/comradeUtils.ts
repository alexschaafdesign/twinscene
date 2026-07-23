// Pure comrade helpers with no server-only dependencies, mirroring
// lib/mediaProUtils.ts's role for media pros: lib/comrades.ts (the Postgres
// data layer) imports lib/db.ts, which pulls in the `postgres` client —
// importing that chain into a client component would bundle `postgres` into
// the browser. Client components that only need slugify()/the category
// vocabulary import from here instead.

export type ComradeCategory =
  | "recording_studio"
  | "record_label"
  | "rehearsal_space"
  | "sound_production"
  | "record_store"
  | "promoter_collective"
  | "other";

export const COMRADE_CATEGORIES: ComradeCategory[] = [
  "recording_studio",
  "record_label",
  "rehearsal_space",
  "sound_production",
  "record_store",
  "promoter_collective",
  "other",
];

export function comradeCategoryLabel(category: string): string {
  switch (category) {
    case "recording_studio":
      return "Recording Studio";
    case "record_label":
      return "Record Label";
    case "rehearsal_space":
      return "Rehearsal Space";
    case "sound_production":
      return "Sound / Production";
    case "record_store":
      return "Record Store / Distro";
    case "promoter_collective":
      return "Promoter / Collective";
    case "other":
    default:
      return "Other";
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
