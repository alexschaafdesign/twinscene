// Server-safe presentational helpers shared by the photo/video directory
// grid (MediaProGrid.tsx) and the profile view (MediaProProfile.tsx).
// Mirrors venue-shared.tsx / band-shared.tsx's role for their entities.

import type { MediaPro } from "@/lib/mediaPros";
import { mediaProRoleLabel } from "@/lib/mediaProUtils";

export { mediaProRoleLabel };

/** First letters of the listing's name words, up to two, for the fallback tile. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Prefilled "edit this listing" submit URL — shown in the profile header. */
export function mediaProEditHref(mediaPro: MediaPro): string {
  const params = new URLSearchParams({
    correct: "true",
    slug: mediaPro.slug,
    name: mediaPro.name,
    role: mediaPro.role,
    city: mediaPro.city ?? "",
    bio: mediaPro.bio ?? "",
    website: mediaPro.website ?? "",
    instagram: mediaPro.instagram ?? "",
    contact: mediaPro.contact ?? "",
    portfolioUrl: mediaPro.portfolio_url ?? "",
  });
  return `/photo-video/submit?${params.toString()}`;
}
