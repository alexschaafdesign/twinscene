// Shared Bandcamp embed-resolution logic.
//
// A submitter pastes a normal Bandcamp URL (e.g. https://band.bandcamp.com/album/foo
// or .../track/bar). To show a compact embedded player we need Bandcamp's numeric
// item id + type, which aren't in the URL — they live in the page's
// `<meta name="bc-page-properties">` tag. This module fetches the page, extracts
// that tag, and builds the EmbeddedPlayer URL.
//
// Used by scripts/backfill-bandcamp.ts. The Apps Script handler (apps-script/Code.gs)
// mirrors resolveBandcampEmbedUrl() / parseBandcampMeta() / buildBandcampEmbedUrl()
// in its own runtime — keep the two in sync when changing the regex or embed shape.

/** True if `url` looks like a bandcamp.com URL (bare or with a subdomain). */
export function isBandcampUrl(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)?bandcamp\.com\//i.test(url.trim());
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

/** Build the compact EmbeddedPlayer URL for a resolved item. */
export function buildBandcampEmbedUrl(item: BandcampItem): string {
  return (
    `https://bandcamp.com/EmbeddedPlayer/${item.itemType}=${item.itemId}/` +
    "size=small/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=small/transparent=true/"
  );
}

type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

/**
 * Fetch a Bandcamp page and resolve it to an EmbeddedPlayer URL. Returns "" on
 * any failure (bad URL, non-bandcamp host, network error, unparseable page) so
 * callers can treat a blank result as "no embed" without try/catch.
 *
 * @param fetchImpl  Injectable fetch (defaults to global fetch) for testing.
 */
export async function resolveBandcampEmbedUrl(
  bandcampUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const url = bandcampUrl.trim();
  if (!isBandcampUrl(url)) return "";
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return "";
    const html = await res.text();
    const item = parseBandcampMeta(html);
    return item ? buildBandcampEmbedUrl(item) : "";
  } catch {
    return "";
  }
}
