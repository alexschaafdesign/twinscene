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
import { fetchDiceShows, extractDiceWidgetConfig } from "./dice";

const EVENTS_URL = "https://www.zhoradarling.com/events";
const VENUE = "Zhora Darling";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

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
  const cfg = extractDiceWidgetConfig(await pageRes.text(), "Zhora");

  return fetchDiceShows({
    venue: VENUE,
    apiKey: cfg.apiKey,
    sourceUrl: EVENTS_URL,
    venues: cfg.venues.length ? cfg.venues : [VENUE],
    promoters: cfg.promoters,
  });
}
