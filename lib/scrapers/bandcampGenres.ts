// Bandcamp genre-tag scraping + Claude Haiku normalization into the
// canonical `genres` table (0047_bandcamp_genres.sql).
//
// Two isolated steps, kept separate so each can be smoke-tested on its own
// before being wired into a trigger or backfill:
//   fetchBandcampTags — raw HTML -> raw tag strings
//   normalizeGenres   — raw tags -> canonical genre + confidence, via Haiku
//
// Deviates from the original spec in one place: current Bandcamp pages carry
// no `TralbumData` JS global and no `tags` key in the `data-tralbum` HTML
// attribute (checked against 7 live band pages, 2026-07) — tags only exist
// as `<a class="tag">` links on a release page. Parsing is `a.tag` only;
// there's no JS-object source left to fall back from.

import * as cheerio from "cheerio";

const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export type BandcampTagFetch = {
  tags: string[];
  // The URL tags actually came from. Differs from the input URL when the
  // input was an artist landing page with no tags of its own (Bandcamp only
  // tags individual releases) and we followed its first release — surfaced
  // rather than substituted silently, since "first" release isn't
  // necessarily representative of the band's whole catalog.
  sourceUrl: string;
  followedFromArtistPage: boolean;
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Bandcamp fetch failed for ${url} (${res.status} ${res.statusText})`,
    );
  }
  return res.text();
}

/** First release link off an artist landing page's release grid, if any. */
function firstReleaseUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const href = $("a[href^='/album/'], a[href^='/track/']").first().attr("href");
  return href ? new URL(href, pageUrl).toString() : null;
}

function parseTags(html: string): string[] {
  const $ = cheerio.load(html);
  const tags = $("a.tag")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  return Array.from(new Set(tags));
}

/**
 * Fetch a Bandcamp URL's tags. If the URL is an artist landing page
 * (`og:type="band"`), follows the first release link in its grid and tags
 * that instead, since artist pages carry no tags of their own.
 */
export async function fetchBandcampTags(url: string): Promise<BandcampTagFetch> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const isArtistPage = $('meta[property="og:type"]').attr("content") === "band";

  if (!isArtistPage) {
    return { tags: parseTags(html), sourceUrl: url, followedFromArtistPage: false };
  }

  const releaseUrl = firstReleaseUrl(html, url);
  if (!releaseUrl) {
    // Artist page with no releases in its grid — nothing to tag from yet.
    return { tags: [], sourceUrl: url, followedFromArtistPage: false };
  }
  const releaseHtml = await fetchHtml(releaseUrl);
  return {
    tags: parseTags(releaseHtml),
    sourceUrl: releaseUrl,
    followedFromArtistPage: true,
  };
}

export type GenreConfidence = "high" | "medium" | "low";
export type NormalizedGenre = {
  genre: string;
  rawTag: string;
  confidence: GenreConfidence;
};
export type NormalizeResult = {
  mapped: NormalizedGenre[];
  // Raw tags Haiku didn't map to anything (place names, vague mood tags,
  // etc.) — logged for review rather than silently discarded.
  dropped: string[];
};

const SYSTEM_PROMPT = `You normalize Bandcamp genre tags for a local music-show directory into a fixed canonical genre list.

Rules:
- Map raw tags to canonical genres from the provided list only. Never invent a new genre name.
- A raw tag can map to more than one canonical genre if it clearly names a compound genre (e.g. "folkpunk" -> Folk Punk, or if that's not in the list, Folk + Punk). Several raw tags can also collapse onto the same canonical genre.
- DROP tags that aren't genres: place names (cities, neighborhoods, states, countries), identity/demographic tags, and vague mood-only descriptors with no clear genre mapping ("lots", "a bunch", "music"). Do not invent a mapping for a dropped tag — omit it entirely.
- confidence "high": the raw tag matches, or is an unambiguous synonym of, a canonical genre directly.
- confidence "medium": you had to infer from a related/adjacent tag (e.g. a sub-genre implying a parent genre, or a portmanteau with a clear dominant component).
- confidence "low": the signal is weak, or the tag is ambiguous and you're guessing.`;

function buildMapGenresTool(canonicalGenres: string[]) {
  return {
    name: "map_genres",
    description: "Map raw Bandcamp tags to canonical genres with a confidence per mapping.",
    input_schema: {
      type: "object" as const,
      properties: {
        mappings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              raw_tag: {
                type: "string",
                description: "The exact raw tag string being mapped, verbatim.",
              },
              genre: { type: "string", enum: canonicalGenres },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["raw_tag", "genre", "confidence"],
          },
        },
      },
      required: ["mappings"],
    },
  };
}

type AnthropicToolUseBlock = {
  type: "tool_use";
  input: { mappings?: { raw_tag: string; genre: string; confidence: GenreConfidence }[] };
};

/** Map raw Bandcamp tags to the canonical genre list via a Claude Haiku call. */
export async function normalizeGenres(
  rawTags: string[],
  canonicalGenres: string[],
): Promise<NormalizeResult> {
  if (rawTags.length === 0) return { mapped: [], dropped: [] };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const tool = buildMapGenresTool(canonicalGenres);
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Canonical genres: ${canonicalGenres.join(", ")}\n\nRaw tags: ${JSON.stringify(rawTags)}`,
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "map_genres" },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic API failed (${res.status} ${res.statusText}): ${await res.text()}`,
    );
  }

  const body = (await res.json()) as { content: (AnthropicToolUseBlock | { type: string })[] };
  const toolUse = body.content.find(
    (b): b is AnthropicToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("Anthropic response had no tool_use block");

  const canonicalSet = new Set(canonicalGenres);
  const mapped: NormalizedGenre[] = [];
  for (const m of toolUse.input.mappings ?? []) {
    if (!canonicalSet.has(m.genre)) {
      console.warn(
        `[bandcampGenres] Haiku returned unknown genre "${m.genre}" for tag "${m.raw_tag}" — skipping`,
      );
      continue;
    }
    mapped.push({ genre: m.genre, rawTag: m.raw_tag, confidence: m.confidence });
  }

  const mappedRawTags = new Set(mapped.map((m) => m.rawTag));
  const dropped = rawTags.filter((t) => !mappedRawTags.has(t));

  return { mapped, dropped };
}
