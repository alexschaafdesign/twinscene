// Normalizing genre + age-restriction values scraped from wildly different
// sources (The Dakota's API category names, Crawl Space's free-text "Folk /
// Singer-Songwriter" or "Reggae, Afrobeats" tags). Kept tiny and pure so both
// the scrapers and the import pipeline can lean on one canonical shape.

/** Split/trim/dedupe genre input into a clean string[]. Accepts a raw string
 * ("Folk / Singer-Songwriter", "Reggae, Afrobeats") or an already-split list
 * (Dakota categories), splitting on "/" and "," either way. Case-insensitive
 * dedupe keeps the first-seen casing. */
export function normalizeGenres(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((s) =>
    String(s).split(/[/,]/),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const g = part.trim().replace(/\s+/g, " ");
    if (!g) continue;
    const key = g.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Tidy an age-restriction label ("[21+]" -> "21+", " all ages " -> "All Ages").
 * Leaves unrecognized phrasings as trimmed text rather than dropping them. */
export function normalizeAge(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[[\]]/g, "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (/^all\s*ages$/i.test(s)) return "All Ages";
  const plus = s.match(/^(\d{1,2})\s*\+$/); // "21+", "18 +"
  if (plus) return `${plus[1]}+`;
  return s;
}
