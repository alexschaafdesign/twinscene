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
  // Set only by press-digest sources (e.g. crawlspace.ts, racket.ts): which
  // outlet picked this show, their blurb (if any), and a link to the post it
  // came from. Optional so venue scrapers are unaffected.
  press?: string | null;
  blurb?: string | null;
  pressPostUrl?: string | null;
};
