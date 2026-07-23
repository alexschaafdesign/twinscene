// Server-safe presentational helpers shared by the comrades directory grid
// (ComradeGrid.tsx) and the profile view (ComradeProfile.tsx). Mirrors
// media-pro-shared.tsx's role for media pros.

import type { Comrade } from "@/lib/comrades";
import { comradeCategoryLabel } from "@/lib/comradeUtils";

export { comradeCategoryLabel };

/** First letters of the listing's name words, up to two, for the fallback tile. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Prefilled "edit this listing" submit URL — shown in the profile header. */
export function comradeEditHref(comrade: Comrade): string {
  const params = new URLSearchParams({
    correct: "true",
    slug: comrade.slug,
    name: comrade.name,
    category: comrade.category,
    tagline: comrade.tagline ?? "",
    city: comrade.city ?? "",
    bio: comrade.bio ?? "",
    website: comrade.website ?? "",
    instagram: comrade.instagram ?? "",
    contact: comrade.contact ?? "",
  });
  return `/comrades/submit?${params.toString()}`;
}
