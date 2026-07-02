// Fuzzy matcher linking scraped band names to bands in the directory.
//
// Scraped names come from venue flyers and rarely match the directory exactly
// (casing, a leading "The", punctuation, etc.), so we normalize both sides and
// use Fuse.js for fuzzy comparison. Each match is bucketed into a confidence
// tier so downstream code can auto-link high-confidence hits and queue the rest
// for human review.

import Fuse from "fuse.js";
import type { Band } from "@/lib/fetchBands";
import type { ScrapedShow } from "@/lib/scrapers/pilllar";

export type MatchResult = {
  name: string;
  match: Band | null;
  confidence: "auto" | "review" | "none";
  score: number;
};

export type MatchedShow = ScrapedShow & {
  bandMatches: MatchResult[];
};

// Fuse scores run 0 (perfect) → 1 (no similarity).
const AUTO_MAX = 0.15;
const REVIEW_MAX = 0.4;

/** Lowercase, drop a leading "the ", strip punctuation, collapse whitespace. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Indexed = { _normalized: string; band: Band };

export function createMatcher(bands: Band[]) {
  const indexed: Indexed[] = bands.map((band) => ({
    _normalized: normalize(band.name),
    band,
  }));

  const fuse = new Fuse(indexed, {
    keys: ["_normalized"],
    threshold: 0.5,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  function matchBand(name: string): MatchResult {
    const normalized = normalize(name);
    if (!normalized) {
      return { name, match: null, confidence: "none", score: 1 };
    }

    const [best] = fuse.search(normalized);
    const score = best?.score ?? 1;

    let confidence: MatchResult["confidence"];
    if (best && score < AUTO_MAX) confidence = "auto";
    else if (best && score < REVIEW_MAX) confidence = "review";
    else confidence = "none";

    return {
      name,
      match: confidence === "none" ? null : (best?.item.band ?? null),
      confidence,
      score,
    };
  }

  function matchShow(show: ScrapedShow): MatchedShow {
    return {
      ...show,
      bandMatches: show.allBands.map(matchBand),
    };
  }

  return { matchBand, matchShow };
}
