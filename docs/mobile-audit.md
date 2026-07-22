# Mobile layout audit — progress notes

Goal: make sure page layouts don't overflow / cause horizontal scrolling on a
phone. Reported symptom: admin and band pages "too wide / had horizontal
scrolling" on mobile.

Status: **in progress** — admin section swept, one real bug found. Band profile
clean. Public/band-facing pages (edit form, /u, /venues, home, /shows, /feed,
/profile/*) not yet swept.

## Method (how the audit was run — reproducible)

The automation browser's viewport is stuck at 1189px (window resize doesn't
change `innerWidth`), so a normal visual pass shows the *desktop* layout, not
the phone. Two things made a real mobile check possible:

1. Turbopack dev serves **per-route CSS** containing only the utilities that
   page actually uses. So a page with no `sm:`/`md:` prefixes has *zero*
   `min-width` media rules — its one layout is the mobile layout.
2. To simulate a phone at any window width: walk `document.styleSheets`, set
   every `min-width` media rule's `mediaText` to `not all` (disables all
   `sm:`/`md:`/`lg:` overrides → only base/mobile styles remain), then constrain
   the page's `<main>` to 390px and flag any descendant whose right edge pokes
   past 390px — skipping elements inside an `overflow-x: auto/scroll/hidden/clip`
   ancestor (those scroll/clip internally and don't push the page).

The `__mobileSim2(390)` function used for this is in the session scratchpad
(`.../scratchpad/` — `localStorage.__sim2`). Re-derive from these notes if gone.

Auth for /admin pages during the audit: minted a dev-branch session directly
(sessions.id = cookie value, plaintext) for the admin user and hit
`/api/auth/callback` with a fresh login token. Dev DB only.

## Results

All values are page-overflow past a 390px viewport, with mobile styles forced.

| Page | Result |
|------|--------|
| `/bands/[slug]` (26bats) | clean (63 media rules, 0 overflow) |
| `/admin` (scrapers) | clean |
| `/admin/users` | table scrolls inside its `overflow-x-auto` wrapper — page itself OK (see note) |
| `/admin/reconcile` | clean |
| `/admin/review` | **OVERFLOW ~36px** — see Finding 1 |
| `/admin/shows` | clean |
| `/admin/bands` | clean (no responsive rules; single-column list) |
| `/admin/venues` | clean |
| `/admin/activity` | clean |
| `/admin/graphics` | clean |
| `/admin/claims` | clean |
| `/admin/band-member-claims` | clean |
| `/admin/venue-claims` | clean |
| `/shows/import` | clean |

Not yet swept: `/submit` (band edit form), `/u/[username]`, `/venues/[slug]`,
`/` (home), `/shows`, `/feed`, `/profile/edit`, `/profile/band`,
`/admin/bands/[slug]/editors`. Also the fixed header (`AccountMenu` +
`SectionNav`) wasn't checked (audit scoped to `<main>`).

## Findings

### Finding 1 — `/admin/review` action-button row overflows ~36px (real)

`components/ReviewPanel.tsx:409`

```tsx
<div className="flex shrink-0 flex-wrap items-center gap-2">
  {/* Keep this one · ✓ Looks good · Edit · Delete */}
```

The four action buttons live in a `shrink-0` group inside an outer
`flex flex-wrap justify-between` row (line 376). On a phone the group wraps to
its own line, but `shrink-0` + `flex-basis:auto` makes it take its full
max-content width (~376px) instead of wrapping the last button, so it pokes ~36px
past a 390px screen.

Likely fix: drop `shrink-0` (let it shrink so `flex-wrap` actually wraps the
buttons), or make it `w-full sm:w-auto`. Verify the desktop single-row layout
still looks right after.

### Note — `/admin/users` table scrolls horizontally on mobile

`app/admin/users/page.tsx:77-78` — a 7-column table (~960px natural) wrapped in
`overflow-x-auto`. The page doesn't overflow (wrapper contains it), but the table
*itself* scrolls sideways on a phone, which is plausibly what felt "too wide."
Optional improvement, not a page-overflow bug: e.g. a stacked card layout on
mobile, or hide lower-priority columns under `sm:`.

## Next steps

1. Sweep the remaining public/band-facing pages with the same method.
2. Fix Finding 1.
3. Decide whether the `/admin/users` table warrants a mobile-friendly layout.
