// Shared shape produced by every venue scraper. Each scraper fetches and parses
// one venue's events into ScrapedShow[]; downstream code (the matcher, the
// import review page, auto-import) is venue-agnostic and works off this type.

export type ScrapedShow = {
  venue: string;
  date: string | null; // YYYY-MM-DD (venue-local)
  headliner: string | null;
  supporting: string[];
  allBands: string[];
  flyerUrl: string | null;
  ticketUrl: string | null;
  doorsTime: string | null;
  musicTime: string | null;
  advancePrice: number | null;
  dosPrice: number | null;
  sourceUrl: string;
  // Set only by curator-digest sources (e.g. crawlspace.ts): which curator
  // picked this show, their blurb (if any), and a link to the post it came
  // from. Optional so venue scrapers are unaffected.
  curator?: string | null;
  blurb?: string | null;
  curatorPostUrl?: string | null;
};
