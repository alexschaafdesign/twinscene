// Registry of venue scrapers.
//
// Each scraper knows how to fetch and parse one venue's events page into
// ScrapedShow[]. Downstream code (API routes, the cron job) looks scrapers up
// by id rather than importing each one directly, so adding a venue is a matter
// of writing its scraper and registering it here.

import type { ScrapedShow } from "./types";
import { scrapePilllar } from "./pilllar";
import { scrapeZhora } from "./zhora";
import { scrapeCloudland } from "./cloudland";
import { scrapeFirstAvenue } from "./firstavenue";
import { scrapeBirdhaus } from "./birdhaus";
import { scrapeWhiteSquirrel } from "./whitesquirrel";

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
  cloudland: {
    id: "cloudland",
    name: "Cloudland Theater",
    scrape: scrapeCloudland,
  },
  firstavenue: {
    id: "firstavenue",
    name: "First Avenue",
    scrape: scrapeFirstAvenue,
  },
  birdhaus: {
    id: "birdhaus",
    name: "The Birdhaus",
    scrape: scrapeBirdhaus,
  },
  whitesquirrel: {
    id: "whitesquirrel",
    name: "White Squirrel Bar",
    scrape: scrapeWhiteSquirrel,
  },
};

export function getScraper(id: string): Scraper | null {
  return SCRAPERS[id] ?? null;
}

export function getAllScrapers(): Scraper[] {
  return Object.values(SCRAPERS);
}
