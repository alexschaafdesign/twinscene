// Shared Bandcamp embed-resolution logic.
//
// A submitter pastes a normal Bandcamp URL (e.g. https://band.bandcamp.com/album/foo
// or .../track/bar). To show a compact embedded player we need Bandcamp's numeric
// item id + type, which aren't in the URL — they live in the page's
// `<meta name="bc-page-properties">` tag. This module fetches the page, extracts
// that tag, and builds the EmbeddedPlayer URL.
//
// A submitter can also paste Bandcamp's own <iframe> embed code instead; that
// path is used verbatim (exact src + height), no scraping needed.
//
// Used by scripts/backfill-bandcamp.ts. The Apps Script handler (apps-script/Code.gs)
// mirrors resolveBandcampEmbedUrl() / parseBandcampMeta() / parseBandcampEmbedSnippet() /
// buildBandcampEmbedUrl() in its own runtime — keep the two in sync when changing
// the regex or embed shape.

/** True if `url` looks like a bandcamp.com URL (bare or with a subdomain).
 * Trailing slash is optional — the "links" section's own placeholder text
 * asks for a bare "https://yourband.bandcamp.com", so requiring a trailing
 * `/` silently rejected exactly the shape that field asks for. */
export function isBandcampUrl(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)?bandcamp\.com(\/|$)/i.test(url.trim());
}

/**
 * Decode the handful of HTML entities Bandcamp emits inside the
 * `content="..."` attribute (the JSON's own quotes are encoded as &quot;).
 * Numeric entities (decimal and hex) are handled generically.
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last, so decoded entities aren't re-decoded
}

/**
 * Normalize Bandcamp's item_type to the "album" | "track" tokens the
 * EmbeddedPlayer URL expects. Bandcamp has historically used both the full
 * words and single letters ("a" / "t"), so accept either.
 */
function normalizeItemType(raw: unknown): "album" | "track" | null {
  const t = String(raw ?? "").toLowerCase();
  if (t === "album" || t === "a") return "album";
  if (t === "track" || t === "t") return "track";
  return null;
}

export type BandcampItem = { itemType: "album" | "track"; itemId: string };

/**
 * Extract { itemType, itemId } from a Bandcamp page's HTML by reading the
 * `<meta name="bc-page-properties">` tag and JSON-parsing its decoded content.
 * Returns null if the tag is missing or unparseable.
 */
export function parseBandcampMeta(html: string): BandcampItem | null {
  const tag = html.match(/<meta[^>]*\bbc-page-properties\b[^>]*>/i)?.[0];
  if (!tag) return null;

  const rawContent = tag.match(/content=(["'])([\s\S]*?)\1/i)?.[2];
  if (!rawContent) return null;

  let props: unknown;
  try {
    props = JSON.parse(decodeHtmlEntities(rawContent));
  } catch {
    return null;
  }
  if (!props || typeof props !== "object") return null;

  const { item_id, item_type } = props as Record<string, unknown>;
  const itemType = normalizeItemType(item_type);
  if (!itemType) return null;
  if (item_id == null || item_id === "") return null;

  return { itemType, itemId: String(item_id) };
}

/**
 * Build the compact EmbeddedPlayer URL for a resolved item — the proven minimal
 * single-line bar (artwork=none), used as the fallback for plain Bandcamp URLs.
 */
export function buildBandcampEmbedUrl(item: BandcampItem): string {
  return (
    `https://bandcamp.com/EmbeddedPlayer/${item.itemType}=${item.itemId}/` +
    "size=small/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=none/transparent=true/"
  );
}

/** A resolved embed: the iframe src and the height to render it at. */
export type BandcampEmbed = { embedUrl: string; height: number };

/** Sentinel for "no embed" so callers can treat a blank result uniformly. */
const NO_EMBED: BandcampEmbed = { embedUrl: "", height: 0 };

/** The minimal bar's known, confirmed-responsive height. */
const MINIMAL_BAR_HEIGHT = 40;

/**
 * Parse a Bandcamp <iframe> embed snippet (from their Share/Embed button) into
 * its src + height, used verbatim. Returns null if `input` isn't an iframe, its
 * src isn't a bandcamp.com EmbeddedPlayer URL (rejected — this is user-submitted
 * input on a public form), or no height can be found.
 */
export function parseBandcampEmbedSnippet(input: string): BandcampEmbed | null {
  if (!/<iframe/i.test(input)) return null;

  const src = input.match(/\bsrc=(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (!src || !/^https:\/\/bandcamp\.com\/EmbeddedPlayer\//i.test(src)) {
    return null;
  }

  // Height from a height="NNN" attribute, else a style="…height:NNNpx…" rule.
  let height = 0;
  const attr = input.match(/\bheight=(["'])\s*(\d+)(?:px)?\s*\1/i);
  if (attr) height = parseInt(attr[2], 10);
  if (!height) {
    const style = input.match(/height\s*:\s*(\d+)\s*px/i);
    if (style) height = parseInt(style[1], 10);
  }
  if (!height || Number.isNaN(height)) return null;

  return { embedUrl: src, height };
}

type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

/**
 * Resolve raw Bandcamp input to an embed. Hybrid behaviour:
 *  - If the input is a pasted <iframe> embed snippet, use its exact src + height.
 *  - Otherwise treat it as a plain URL: scrape the page's meta tag and build the
 *    minimal-bar embed at its known fixed height.
 * Returns a blank embed ({ embedUrl: "", height: 0 }) on any failure (bad URL,
 * non-bandcamp host, network error, unparseable page/snippet).
 *
 * @param fetchImpl  Injectable fetch (defaults to global fetch) for testing.
 */
export async function resolveBandcampEmbedUrl(
  rawInput: string,
  fetchImpl: FetchLike = fetch,
): Promise<BandcampEmbed> {
  const input = rawInput.trim();

  if (/<iframe/i.test(input)) {
    return parseBandcampEmbedSnippet(input) ?? NO_EMBED;
  }

  if (!isBandcampUrl(input)) return NO_EMBED;
  try {
    const res = await fetchImpl(input);
    if (!res.ok) return NO_EMBED;
    const html = await res.text();
    const item = parseBandcampMeta(html);
    return item
      ? { embedUrl: buildBandcampEmbedUrl(item), height: MINIMAL_BAR_HEIGHT }
      : NO_EMBED;
  } catch {
    return NO_EMBED;
  }
}
