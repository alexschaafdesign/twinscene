// Runs every registered press outlet's picks (lib/scrapers/pressScrapers.ts)
// against our own upcoming shows and stars the matches. Deliberately separate
// from runAll.ts's scrape → auto-import → review pipeline: a press pick isn't
// a new show to add, it's an endorsement of one we (usually) already have.

import { fetchShows } from "@/lib/fetchShows";
import { findShowMatch } from "@/lib/showMatcher";
import { PRESS_SCRAPERS, type PressScraper } from "./pressScrapers";
import type { ScrapedShow } from "./types";

export type PressStarResult = {
  id: string;
  name: string;
  picks: number;
  starred: number;
  unmatched: number;
  errors: number;
};

async function starOutlet(
  outlet: PressScraper,
  picks: ScrapedShow[],
  shows: Awaited<ReturnType<typeof fetchShows>>,
  baseUrl: string,
): Promise<PressStarResult> {
  let starred = 0;
  let unmatched = 0;
  let errors = 0;

  for (const pick of picks) {
    const match = findShowMatch(pick, shows);
    // Can't target a star write without a stable row id.
    if (!match) {
      unmatched++;
      continue;
    }

    try {
      const res = await fetch(`${baseUrl}/api/shows/star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.SCRAPE_SECRET,
          id: match.id,
          outlet: pick.press || outlet.id,
          blurb: pick.blurb ?? "",
          url: pick.pressPostUrl ?? "",
        }),
      });
      const data = await res.json();
      if (data.success) starred++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { id: outlet.id, name: outlet.name, picks: picks.length, starred, unmatched, errors };
}

export async function runAllPressStars(baseUrl: string): Promise<PressStarResult[]> {
  // Fetched once, shared across every outlet's matching.
  const shows = await fetchShows();

  // One failing outlet must not block the others.
  const results = await Promise.allSettled(
    PRESS_SCRAPERS.map(async (outlet) => {
      const picks = await outlet.scrape();
      return starOutlet(outlet, picks, shows, baseUrl);
    }),
  );

  return results.map((result, i) => {
    const outlet = PRESS_SCRAPERS[i];
    if (result.status === "fulfilled") return result.value;
    return {
      id: outlet.id,
      name: outlet.name,
      picks: 0,
      starred: 0,
      unmatched: 0,
      errors: 1,
    };
  });
}
