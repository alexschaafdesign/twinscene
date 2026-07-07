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

/** Lowercase, expand "&", drop a leading "the ", strip punctuation. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein edit distance. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** 0 (unrelated) → 1 (identical) similarity of two normalized strings. */
function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
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
