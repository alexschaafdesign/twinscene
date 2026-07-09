// Fuzzy matcher linking scraped band names to bands in the directory.
//
// Scraped names come from venue flyers and rarely match the directory exactly
// (casing, a leading "The", punctuation, etc.), so we normalize both sides and
// use Fuse.js to find the likeliest candidate. Fuse alone is too generous — with
// ignoreLocation a short name matches as a substring of a longer one ("Lent"
// inside "Covalent Blond"), so we re-score the candidate with a whole-string
// edit-distance similarity and bucket on that. Each match lands in a confidence
// tier so downstream code can auto-link strong hits and queue the rest.

import Fuse from "fuse.js";
import type { Band } from "@/lib/fetchBands";
import type { ScrapedShow } from "@/lib/scrapers/pilllar";
import { normalizeText, similarity } from "@/lib/textSimilarity";

export type MatchResult = {
  name: string;
  match: Band | null;
  confidence: "auto" | "review" | "none";
  score: number; // whole-string similarity, 0 (unrelated) → 1 (identical)
};

export type MatchedShow = ScrapedShow & {
  bandMatches: MatchResult[];
};

// Similarity of the scraped name to the candidate's name, as a whole. Tuned so
// substring coincidences ("Lent" vs "Covalent Blond" ≈ 0.29) fall to 'none'
// while real variants (typos, "&"/"the"/punctuation) stay high.
const AUTO_MIN_SIM = 0.85;
const REVIEW_MIN_SIM = 0.7;

type Indexed = { _normalized: string; band: Band };

export function createMatcher(bands: Band[]) {
  const indexed: Indexed[] = bands.map((band) => ({
    _normalized: normalizeText(band.name),
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
    const normalized = normalizeText(name);
    if (!normalized) {
      return { name, match: null, confidence: "none", score: 0 };
    }

    // Fuse finds the likeliest candidate; similarity decides if it's real.
    const [best] = fuse.search(normalized);
    if (!best) {
      return { name, match: null, confidence: "none", score: 0 };
    }

    const score = similarity(normalized, best.item._normalized);

    let confidence: MatchResult["confidence"];
    if (score >= AUTO_MIN_SIM) confidence = "auto";
    else if (score >= REVIEW_MIN_SIM) confidence = "review";
    else confidence = "none";

    return {
      name,
      match: confidence === "none" ? null : best.item.band,
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
