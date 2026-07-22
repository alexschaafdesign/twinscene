# Mobile layout audit — progress notes

Goal: make sure page layouts don't overflow / cause horizontal scrolling on a
phone. Reported symptom: admin and band pages "too wide / had horizontal
scrolling" on mobile.

Status: **complete** — whole app swept, two real overflow bugs found and fixed
(`/shows` cards, `/admin/review` button row). Everything else clean. See
"Findings" for the fixes and "Full results" for the per-page sweep.

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
Content pages (`<main>`): `/`, `/shows`, `/feed`, `/venues`, `/venues/[slug]`
(acadia, 7th-st-entry), `/musicians`, `/bands/[slug]` (26bats), `/submit`,
`/u/[username]`, `/profile/edit`, `/profile/band`, and every `/admin/*` page
plus `/shows/import` and `/admin/bands/[slug]/editors` — **all clean after the
fixes below**. The two that overflowed:

| Page | Was | Now |
|------|-----|-----|
| `/shows` (+ any show list) | show cards **+60px** on long titles | fixed |
| `/admin/review` | action-button row **+36px** | fixed |

Fixed header (`AccountMenu` + `SectionNav`): clean. `SectionNav` looks like it
overflows 300px+ on mobile, but that's intentional — its `<ul>` is
`overflow-x-auto` below `sm` (swipeable tabs, comment in the component), so it
scrolls internally and never pushes the page.

## Findings (fixed)

### Finding 1 — show cards overflowed on long titles/venues — FIXED

`components/ShowsTimeline.tsx:228` (the shared show card — drives `/shows`, the
home shows, and band-profile show lists).

A show whose title/venue/lineup contained a long unbroken token (e.g. a
run-together band name) forced the card wider than a phone (~430px vs ~350
available). The card's text sits in a flex item with `min-w-0`, but the token
still set the text's min-content width, and the fixed avatar + `shrink-0`
"Interested" column left no slack.

Fix: added `wrap-anywhere` (`overflow-wrap: anywhere`) to the text container.
`overflow-wrap` is inherited, so it covers title/venue/subtitle/notes at once.
Note `break-words` (already used elsewhere) does **not** work here — inside a
flex item it doesn't reduce min-content size; only `anywhere` (or
`word-break: break-all`) does. Verified in-browser: 430px → 350px.

### Finding 2 — `/admin/review` action-button row overflowed ~36px — FIXED

`components/ReviewPanel.tsx:409`. The four action buttons were a `shrink-0`
group inside an outer `flex flex-wrap justify-between` row. On a phone the group
wraps to its own line, but `shrink-0` made it hold its full max-content width
(~376px) instead of letting `flex-wrap` drop the last button. Fix: removed
`shrink-0` so it shrinks and wraps. Desktop single-row layout unchanged
(justify-between still spaces them when there's room). Verified: +36px → −50px.

### Note (not fixed) — `/admin/users` table scrolls horizontally on mobile

`app/admin/users/page.tsx:77` — a 7-column table (~960px natural) in an
`overflow-x-auto` wrapper. The page doesn't overflow (wrapper contains it), but
the table itself scrolls sideways on a phone. Left as-is; a stacked-card or
column-hiding mobile layout would be a nice-to-have, not an overflow bug.
