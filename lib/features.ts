// Central feature flags.
//
// NEXT_PUBLIC_ so the value is available in both server and client components
// (inlined at build time). Shows are hidden unless explicitly enabled, so a
// production deploy that doesn't set the var ships the directory only.
//
// Enable locally by adding to .env.local:  NEXT_PUBLIC_SHOWS_ENABLED=true
export const SHOWS_ENABLED = process.env.NEXT_PUBLIC_SHOWS_ENABLED === "true";

// Server-only (not NEXT_PUBLIC): when true, a scraper run auto-imports every
// scraped show instead of queuing the ones whose lineup isn't fully matched to
// the directory for manual review. A blunt "just get them all in" switch — band
// links still only attach for confident matches, and the import page's relink
// sweep can wire up the rest later. Flip off by unsetting the var.
export const AUTO_IMPORT_ALL_SHOWS =
  process.env.SCRAPE_AUTO_IMPORT_ALL === "true";
