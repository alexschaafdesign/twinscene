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
import { scrapeCedar } from "./cedar";
import { scrapeHookAndLadder } from "./hookandladder";

export type { ScrapedShow };

export type Scraper = {
  id: string;
  name: string;
  scrape: () => Promise<ScrapedShow[]>;
  // When true, this venue's site blocks scrapes from datacenter IPs (e.g.
  // Cloudflare 403s Vercel's egress), so it only works from a residential IP.
  // The Vercel cron skips these; run them locally instead (npm run scrape:local),
  // which writes to the same shared Postgres DB. On-demand endpoints still run
  // them if asked (so a local `/api/scrape/<id>` works).
  localOnly?: boolean;
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
  cedar: {
    id: "cedar",
    name: "The Cedar Cultural Center",
    scrape: scrapeCedar,
  },
  hookandladder: {
    id: "hookandladder",
    name: "The Hook and Ladder",
    scrape: scrapeHookAndLadder,
    localOnly: true, // Cloudflare 403s datacenter IPs — run locally (npm run scrape:local)
  },
};

export function getScraper(id: string): Scraper | null {
  return SCRAPERS[id] ?? null;
}

export function getAllScrapers(): Scraper[] {
  return Object.values(SCRAPERS);
}

/** Scrapers the Vercel cron runs — everything except localOnly venues, whose
 * sites block datacenter IPs and must be scraped locally from a residential IP. */
export function getCronScrapers(): Scraper[] {
  return Object.values(SCRAPERS).filter((s) => !s.localOnly);
}

/** localOnly venues — run these from a residential IP via `npm run scrape:local`. */
export function getLocalOnlyScrapers(): Scraper[] {
  return Object.values(SCRAPERS).filter((s) => s.localOnly);
}
