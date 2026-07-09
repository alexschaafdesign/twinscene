// Registry of press-digest scrapers — mirrors lib/scrapers/index.ts's venue
// scraper registry, but for outlets whose picks star shows on our list
// rather than get imported as new ones (see lib/scrapers/starPress.ts). Add
// an outlet here once it has a parser; its display name should match a
// SLUG in the Press sheet tab.

import type { ScrapedShow } from "./types";
import { scrapeCrawlSpace, CRAWLSPACE_PRESS_ID } from "./crawlspace";
import { scrapeRacket, RACKET_PRESS_ID } from "./racket";

export type PressScraper = {
  id: string;
  name: string;
  scrape: () => Promise<ScrapedShow[]>;
};

export const PRESS_SCRAPERS: PressScraper[] = [
  { id: CRAWLSPACE_PRESS_ID, name: "crawl space", scrape: scrapeCrawlSpace },
  { id: RACKET_PRESS_ID, name: "racket", scrape: scrapeRacket },
];
