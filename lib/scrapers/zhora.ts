// Scraper for Zhora Darling's events page.
//
// https://www.zhoradarling.com/events is a Squarespace page whose event list is
// rendered client-side by the Dice.fm widget — the server HTML has no event
// markup. What the HTML *does* carry is the widget's init config (a partner
// apiKey plus venue/promoter filters). So we read that config off the page and
// hand it to the shared Dice fetch/mapping. Reading the key from the page
// (rather than hardcoding) means the scraper follows the venue if they re-point
// the widget.

import type { ScrapedShow } from "./types";
import { fetchDiceShows } from "./dice";

const EVENTS_URL = "https://www.zhoradarling.com/events";
const VENUE = "Zhora Darling";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// The config passed to DiceEventListWidget.create({...}) in the page.
type DiceConfig = {
  apiKey: string;
  venues: string[];
  promoters: string[];
};

/** Pull the DiceEventListWidget.create({...}) config object out of the page. */
function extractDiceConfig(html: string): DiceConfig {
  const m = html.match(/DiceEventListWidget\.create\((\{[\s\S]*?\})\)/);
  if (!m) {
    throw new Error("Zhora: Dice widget config not found on the events page");
  }
  // Squarespace may HTML-escape the embedded code block; undo the common ones.
  const json = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("Zhora: could not parse the Dice widget config");
  }

  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
  if (!apiKey) throw new Error("Zhora: Dice widget config is missing apiKey");

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return { apiKey, venues: strList(cfg.venues), promoters: strList(cfg.promoters) };
}

export async function scrapeZhora(): Promise<ScrapedShow[]> {
  const pageRes = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(
      `Zhora events page failed (${pageRes.status} ${pageRes.statusText})`,
    );
  }
  const cfg = extractDiceConfig(await pageRes.text());

  return fetchDiceShows({
    venue: VENUE,
    apiKey: cfg.apiKey,
    sourceUrl: EVENTS_URL,
    venues: cfg.venues.length ? cfg.venues : [VENUE],
    promoters: cfg.promoters,
  });
}
