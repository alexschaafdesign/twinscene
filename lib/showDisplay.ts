// Bands-forward show labelling. A show's marquee is the lineup (who's playing);
// the stored `title` is an optional editorial name ("New Band Night", "Album
// Release") shown as a subtitle. These helpers derive both from the Show fields
// so every surface renders them consistently. Kept dependency-free (no db/server
// imports) so client components can import it too.

type TitleParts = { lineup: string; title: string; venue?: string };

/**
 * The bands-forward heading: the lineup if the show has one, otherwise the
 * stored title, otherwise the venue. This is what should read as the show's
 * "title" visually.
 */
export function showHeading(show: TitleParts): string {
  return show.lineup.trim() || show.title.trim() || show.venue?.trim() || "";
}

/**
 * The optional editorial subtitle shown under the heading. Returned only when
 * `title` is a distinct name rather than a restatement of the lineup or one of
 * its acts — scraped rows commonly set title = the first act, and manual adds
 * default title = the lineup string, neither of which should echo as a subtitle.
 */
export function showSubtitle(show: TitleParts): string {
  const title = show.title.trim();
  if (!title) return "";
  const lineup = show.lineup.trim();
  if (!lineup) return ""; // title already serves as the heading
  const t = title.toLowerCase();
  if (t === lineup.toLowerCase()) return "";
  const acts = lineup.split(",").map((a) => a.trim().toLowerCase());
  if (acts.includes(t)) return "";
  return title;
}

/** Split a "for fans of" pull-quote (show.similarTo) into individual chip
 * labels — same separator handling as the scrapers' band-name splitters, so
 * "A, B & C" or "A, B, and C" render as three chips instead of one string. */
export function splitSimilarTo(similarTo: string): string[] {
  return similarTo
    .split(/\s*,\s*&\s+|\s*,\s*and\s+|\s*&\s+|\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
