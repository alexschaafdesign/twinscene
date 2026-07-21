// Splits a "for fans of" / "recommended if you like" pull-quote out of a
// source's free-text event description, so it can be surfaced as its own
// line (shows.similar_to) instead of sitting inside a paragraph of prose.
// Also drops any paragraph that's nothing but a bare link (a lyric-video/
// social-link line some bios trail off with) — not descriptive prose, and it
// doesn't read well embedded in the show page's description text.
//
// Only matches "for fans of" when that phrase starts its own paragraph — the
// common shape seen on Dice event descriptions, e.g. a trailing "For Fans
// of.. NIN, Deftones, Massive Attack" paragraph. A phrase embedded
// mid-paragraph isn't touched, since splitting mid-sentence risks mangling
// the surrounding prose; it just stays part of the description as-is.

const FOR_FANS_OF_RE = /^(?:for\s+fans\s+of|recommended\s+if\s+you\s+like|riyl)\s*[:.\-]*\s*/i;
const BARE_URL_LINE_RE = /^https?:\/\/\S+$/i;

function isAllLinks(paragraph: string): boolean {
  return paragraph.split("\n").every((line) => BARE_URL_LINE_RE.test(line.trim()));
}

export function extractSimilarTo(raw: string | null | undefined): {
  description: string | null;
  similarTo: string | null;
} {
  const text = (raw ?? "").trim();
  if (!text) return { description: null, similarTo: null };

  const paragraphs = text.split(/\n{2,}/).filter((p) => !isAllLinks(p.trim()));
  const idx = paragraphs.findIndex((p) => FOR_FANS_OF_RE.test(p.trim()));
  if (idx === -1) {
    return { description: paragraphs.join("\n\n").trim() || null, similarTo: null };
  }

  const similarTo =
    paragraphs[idx].trim().replace(FOR_FANS_OF_RE, "").trim().replace(/\.$/, "") || null;
  const description = paragraphs.filter((_, i) => i !== idx).join("\n\n").trim() || null;
  return { description, similarTo };
}
