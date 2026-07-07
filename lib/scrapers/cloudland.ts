// Scraper for Cloudland Theater.
//
// https://www.cloudlandtheater.com/ is a Squarespace page that shows flyer
// images with per-show "Buy Tickets" links out to Dice — it has no on-page Dice
// widget config to read (unlike Zhora). But the venue's whole calendar is
// queryable from the Dice partner API by name, so we skip the flyer/link
// scraping entirely and pull it in one call with the shared widget key.

import type { ScrapedShow } from "./types";
import { fetchDiceShows, DICE_WIDGET_API_KEY } from "./dice";

const VENUE = "Cloudland Theater";
const SOURCE_URL = "https://www.cloudlandtheater.com/";

export async function scrapeCloudland(): Promise<ScrapedShow[]> {
  return fetchDiceShows({
    venue: VENUE,
    apiKey: DICE_WIDGET_API_KEY,
    sourceUrl: SOURCE_URL,
  });
}
