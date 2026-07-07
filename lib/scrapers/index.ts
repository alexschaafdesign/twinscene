// Registry of venue scrapers.
//
// Each scraper knows how to fetch and parse one venue's events page into
// ScrapedShow[]. Downstream code (API routes, the cron job) looks scrapers up
// by id rather than importing each one directly, so adding a venue is a matter
// of writing its scraper and registering it here.

import type { ScrapedShow } from "./types";
import { scrapePilllar } from "./pilllar";
import { scrapeZhora } from "./zhora";

export type { ScrapedShow };

export type Scraper = {
  id: string;
  name: string;
  scrape: () => Promise<ScrapedShow[]>;
};

export const SCRAPERS: Record<string, Scraper> = {
  pilllar: {
    id: "pilllar",
    name: "Pilllar Forum",
    scrape: scrapePilllar,
  },
  zhora: {
    id: "zhora",
    name: "Zhora Darling",
    scrape: scrapeZhora,
  },
};

export function getScraper(id: string): Scraper | null {
  return SCRAPERS[id] ?? null;
}

export function getAllScrapers(): Scraper[] {
  return Object.values(SCRAPERS);
}
