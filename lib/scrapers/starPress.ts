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
  submitUrl: string,
): Promise<PressStarResult> {
  let starred = 0;
  let unmatched = 0;
  let errors = 0;

  for (const pick of picks) {
    const match = findShowMatch(pick, shows);
    // Can't target a star write without a stable row id (pre-ID legacy row).
    if (!match || !match.id) {
      unmatched++;
      continue;
    }

    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        body: new URLSearchParams({
          formType: "showStar",
          id: match.id,
          starredBy: pick.press || outlet.id,
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

export async function runAllPressStars(): Promise<PressStarResult[]> {
  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
  if (!submitUrl) {
    return PRESS_SCRAPERS.map((o) => ({
      id: o.id,
      name: o.name,
      picks: 0,
      starred: 0,
      unmatched: 0,
      errors: 0,
    }));
  }

  // Fetched once, shared across every outlet's matching.
  const shows = await fetchShows();

  // One failing outlet must not block the others.
  const results = await Promise.allSettled(
    PRESS_SCRAPERS.map(async (outlet) => {
      const picks = await outlet.scrape();
      return starOutlet(outlet, picks, shows, submitUrl);
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
