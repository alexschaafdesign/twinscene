# Perf baseline — band photo thumbnails (images-only pass)

Tracks the before/after for swapping the bands directory's grid/list cards from
full-resolution band photos (958–1080px, 60–220 KB) to a pre-generated 400px
square thumbnail (~20–35 KB). Scope is **images only** — no caching/ISR (#2/#3)
or query-pattern (#4/#5) changes, so any delta here is attributable to the image
change alone.

## How to measure (keep before/after identical)

- **Source of truth = live/preview site, not `next dev`.** Before = production
  (`https://twinscene.org`) as it stands today (frontend swap not yet deployed,
  so it still serves full-res). After = a Vercel **preview deploy** of this
  branch.
- **Throttling:** Chrome DevTools → **Slow 4G + 4× CPU**, mobile viewport.
- **Image bytes:** Network tab → filter **Img** → record *transferred* total and
  image count (this number is throttle-independent, so it's the most trustworthy
  cross-check).
- **Score / LCP / FCP:** Lighthouse **mobile** report (Lighthouse applies its own
  Slow-4G + 4× CPU throttling), for both `/bands` and `/shows`.
- Default mobile view is the **compact list** (44px thumbnails); note if you
  measure gallery (180px) instead, and keep it the same before vs. after.
- `/shows` is a **control** — this change doesn't touch show/flyer images, so its
  numbers should stay roughly flat. If it moves a lot, something else is going on.

## Results

**Before** = live production (`twinscene.org`) captured 2026-07-16, before this
branch deployed (still serving full-res). **After** = Vercel preview deploy of
`perf/band-thumbnails`. (The automated claude-in-chrome bytes capture couldn't
run — extension not connected — so the Before image-bytes number was read from
the live Network tab.)

### `/bands` — bands directory (Lighthouse mobile)

| Metric | Before (full-res) | After (400px thumb) | Δ |
|---|---|---|---|
| Lighthouse mobile score | **77** | _TBD_ | |
| LCP | **6,415 ms** | _TBD_ | |
| FCP | **1,171 ms** | _TBD_ | |
| Image bytes (Network → Img, full load) | **7,316 KB** (37 requests) | _TBD_ | |

> `/bands` LCP scores **10/100** in Lighthouse on its own — it is the primary
> drag on the page's overall 77. The LCP element is a band photo, so the
> thumbnail swap targets exactly this metric.

### `/shows` — control (show/flyer images, not touched by this change)

| Metric | Before | After | Δ |
|---|---|---|---|
| Lighthouse mobile score | **87** | _TBD_ | |
| LCP | **3,631 ms** | _TBD_ | |
| FCP | **2,324 ms** | _TBD_ | |

## Known facts (measured, build-independent)

These don't depend on throttling or build mode:

- **Bands with photos backfilled:** 272 / 272 (0 failures).
- **Per-thumbnail size:** avg **23.0 KB**, max **56.3 KB** (from 60–220 KB
  originals) — a ~**80%** byte reduction per image.
- **Thumbnail spec:** 400×400 JPEG, `cover` crop, quality 80 (mozjpeg), served
  from `images.thebirdhaus.org/bands/thumb/<slug>.jpg`.
- **Caching:** thumbnails and originals both return `cf-cache-status: DYNAMIC`
  with no object `cache-control` — identical behavior, no regression. (Edge-
  caching them at Cloudflare is a separate, cheap follow-up.)

### Rough expected directory delta

Mobile compact list, ~12–18 cards in initial lazy range × ~120 KB avg full-res ≈
**1.5–2 MB before** → same count × ~23 KB ≈ **~0.3–0.4 MB after** (~5–6× less
image data). Confirm with the actual Network-tab number above.
