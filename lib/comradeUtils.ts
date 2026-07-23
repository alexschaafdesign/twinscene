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
  | "photo_video"
  | "other";

export const COMRADE_CATEGORIES: ComradeCategory[] = [
  "recording_studio",
  "record_label",
  "rehearsal_space",
  "sound_production",
  "record_store",
  "promoter_collective",
  // Photographers/videographers — folded in from the retired standalone
  // Photo/Video directory (media_pros), which was itself just "scene people
  // who aren't bands/musicians". They keep a portfolio gallery, unlike the
  // other categories (see lib/comrades.ts's gallery/portfolio_url columns).
  "photo_video",
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
    case "photo_video":
      return "Photo / Video";
    case "other":
    default:
      return "Other";
  }
}

// URL-facing category slugs for the per-category listing pages
// (/comrades/c/<slug>). The enum values already read like slugs except for the
// underscore, so the mapping is a mechanical `_` <-> `-` swap — but we route it
// through COMRADE_CATEGORIES so an unknown slug resolves to null (→ 404) rather
// than silently constructing a bogus category.
export function categorySlug(category: ComradeCategory): string {
  return category.replace(/_/g, "-");
}

export function categoryFromSlug(slug: string): ComradeCategory | null {
  return COMRADE_CATEGORIES.find((c) => categorySlug(c) === slug) ?? null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
