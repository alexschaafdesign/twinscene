<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Shows feature flag

The Shows feature (scrapers, `app/shows/**`, `lib/scrapers/**`, the shows admin,
plus the shows bits woven into the home page, band profiles, and `SubmitForm`) is
in progress and gated behind `NEXT_PUBLIC_SHOWS_ENABLED` (`lib/features.ts`). It all
lives on `main` — no separate branch — and the flag alone decides whether it's
visible:

- **Production:** leave `NEXT_PUBLIC_SHOWS_ENABLED` unset (falsy) so Shows stays
  hidden — the nav link, `/shows*` routes, band-profile shows, the home-page admin
  link, and the daily scrape cron all no-op.
- **Local dev:** enable it in `.env.local` with `NEXT_PUBLIC_SHOWS_ENABLED=true`.
- The flag is `NEXT_PUBLIC_`, so it's inlined at build time — a production build
  without it tree-shakes the Shows UI out entirely.
- When gating a new Shows surface, import `SHOWS_ENABLED` from `@/lib/features` and
  guard on it (mirror the existing routes/components) so nothing leaks with the
  flag off.
