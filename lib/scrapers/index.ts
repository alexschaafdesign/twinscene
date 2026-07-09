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
import { scrapeBerlin } from "./berlin";
import { scrapeTheMess } from "./themess";
import { scrapeGreenRoom } from "./greenroom";
import { scrape331Club } from "./331club";
import { scrapeIcehouse } from "./icehouse";

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
  berlin: {
    id: "berlin",
    name: "Berlin",
    scrape: scrapeBerlin,
  },
  themess: {
    id: "themess",
    name: "The Mess",
    scrape: scrapeTheMess,
  },
  greenroom: {
    id: "greenroom",
    name: "Green Room",
    scrape: scrapeGreenRoom,
  },
  "331club": {
    id: "331club",
    name: "331 Club",
    scrape: scrape331Club,
  },
  icehouse: {
    id: "icehouse",
    name: "Icehouse",
    scrape: scrapeIcehouse,
  },
};

export function getScraper(id: string): Scraper | null {
  return SCRAPERS[id] ?? null;
}

export function getAllScrapers(): Scraper[] {
  return Object.values(SCRAPERS);
}
