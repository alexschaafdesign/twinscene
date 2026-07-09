import type { StarredNote } from "@/lib/fetchShows";
import type { Press } from "@/lib/fetchPress";

export type PressNote = { id: string; name: string; blurb: string; url: string };

/**
 * Pairs each press outlet that starred a show with their blurb/post link, if
 * given. `press` is the Press-tab directory (fetchPress()); an id with no
 * matching row (tab not set up yet, or a typo'd slug) falls back to the raw
 * id so a card still renders something sane instead of blank.
 */
export function pressNotes(
  starredBy: string[],
  starredNotes: Record<string, StarredNote>,
  press: Press[],
): PressNote[] {
  return starredBy.map((id) => {
    const outlet = press.find((p) => p.slug === id);
    return {
      id,
      name: outlet?.name ?? id,
      blurb: starredNotes[id]?.blurb ?? "",
      url: starredNotes[id]?.url ?? "",
    };
  });
}
