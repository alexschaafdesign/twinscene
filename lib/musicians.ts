import type { Band } from "@/lib/fetchBands";

export type MusicianEntry = {
  name: string; // first-seen casing across bands
  bands: { name: string; slug: string }[];
};

/** Groups every band's `members` into one row per person (case-insensitive,
 * first-seen casing kept), each carrying the bands they're in. Sorted by
 * number of bands descending, then name — people in the most bands surface
 * first. */
export function buildMusiciansDirectory(bands: Band[]): MusicianEntry[] {
  const map = new Map<string, MusicianEntry>();
  for (const band of bands) {
    for (const raw of band.members) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const entry = map.get(key);
      if (entry) entry.bands.push({ name: band.name, slug: band.slug });
      else map.set(key, { name, bands: [{ name: band.name, slug: band.slug }] });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.bands.length - a.bands.length ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
