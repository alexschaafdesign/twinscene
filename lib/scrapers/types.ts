// Shared shape produced by every venue scraper. Each scraper fetches and parses
// one venue's events into ScrapedShow[]; downstream code (the matcher, the
// import review page, auto-import) is venue-agnostic and works off this type.

export type ScrapedShow = {
  venue: string;
  date: string | null; // YYYY-MM-DD (venue-local)
  // Explicit display title, when the source names the show separately from its
  // lineup (e.g. Birdhaus frontmatter). null/absent means no override — callers
  // fall back to headliner/allBands[0], same as before this field existed.
  title?: string | null;
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
  // Event-type label for listings that aren't a normal band bill — e.g. a
  // private event, record sale, or industry meetup. Set by scrapers that
  // accept all of a venue's events rather than dropping the non-shows (see
  // hookandladder.ts); null/absent means an ordinary music show. Flows through
  // to the import review UI and the shows table's event_type column.
  tag?: string | null;
  // Genre suggestions for the show. Set by sources that categorize events —
  // The Dakota's API categories, Crawl Space's per-show <em> tags. Absent/empty
  // for venues that don't. Best-effort, admin-overridable (shows.genres, 0040).
  genres?: string[];
  // Age restriction as the source phrases it: "21+", "18+", "All Ages".
  // null/absent when the source doesn't say (shows.age_restriction, 0040).
  ageRestriction?: string | null;
  // Set only by press-digest sources (e.g. crawlspace.ts, racket.ts): which
  // outlet picked this show, their blurb (if any), and a link to the post it
  // came from. Optional so venue scrapers are unaffected.
  press?: string | null;
  blurb?: string | null;
  pressPostUrl?: string | null;
  // Long-form event description, when the source provides one (e.g. Dice's
  // per-event description). Optional so scrapers without one are unaffected;
  // shows up as free text on the show page (shows.description, 0046).
  description?: string | null;
  // A "for fans of" / "recommended if you like" pull-quote, split out of
  // `description` when the source embeds one inline (lib/scrapers/similarTo.ts)
  // so it can be surfaced as its own line (shows.similar_to, 0046).
  similarTo?: string | null;
};
