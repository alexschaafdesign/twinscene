// Runs Crawl Space's daily top-picks against our own upcoming shows and
// stars the ones that match. Deliberately separate from runAll.ts's
// scrape → auto-import → review pipeline: a curator's pick isn't a new show
// to add, it's an endorsement of one we (usually) already have.

import { fetchShows } from "@/lib/fetchShows";
import { findShowMatch } from "@/lib/showMatcher";
import { scrapeCrawlSpace, CRAWLSPACE_CURATOR } from "./crawlspace";

export type CrawlSpaceStarResult = {
  picks: number;
  starred: number;
  unmatched: number;
  errors: number;
};

export async function runCrawlSpaceStar(): Promise<CrawlSpaceStarResult> {
  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
  const picks = await scrapeCrawlSpace();
  if (!submitUrl || picks.length === 0) {
    return { picks: picks.length, starred: 0, unmatched: picks.length, errors: 0 };
  }

  const shows = await fetchShows();

  let starred = 0;
  let unmatched = 0;
  let errors = 0;

  for (const pick of picks) {
    const match = findShowMatch(pick, shows);
    if (!match) {
      unmatched++;
      continue;
    }
    if (!match.id) {
      // Can't target a star write without a stable row id (pre-ID legacy row).
      unmatched++;
      continue;
    }

    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        body: new URLSearchParams({
          formType: "showStar",
          id: match.id,
          starredBy: CRAWLSPACE_CURATOR,
          blurb: pick.blurb ?? "",
          url: pick.curatorPostUrl ?? "",
        }),
      });
      const data = await res.json();
      if (data.success) starred++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { picks: picks.length, starred, unmatched, errors };
}
