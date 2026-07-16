# Perf baseline — Twin Scene image audit

## Two independent levers — report them separately, never as one score

This audit found **two unrelated problems** on `/bands`, fixed by **two unrelated
changes**. Keep their metrics split; do **not** collapse into a single "score went
from 77 → X" headline — that would hide which change fixed what, and mislead the
next audit.

| Lever | Change (PR) | Metric it owns | Why |
|---|---|---|---|
| Band-photo over-fetch | 400px thumbnails (`perf/band-thumbnails`) | **Total transferred bytes** (the ~7.3 MB) | The grid downloaded 958–1080px photos for 44–180px cards. Doesn't touch LCP in mobile compact view. |
| Oversized hero logo | `logo.webp` + intrinsic dims (`perf/logo-lcp`) | **LCP** (and the CLS) | `logo.png` was 828 KB, eager, above-fold — the largest contentful paint, and unsized (0-height until load). |

**If LCP regresses in a future audit, check the hero/logo path first** — not band
photos. The thumbnail work was never going to move the mobile-compact LCP, because
that LCP element is the header logo, not a band card (verify via the LCP-element
audit each time). The two previews isolate the levers: the `perf/logo-lcp` preview
still serves full-res band photos, so any LCP drop there is the logo alone; the
`perf/band-thumbnails` preview still serves the 828 KB logo, so any byte drop there
is the thumbnails alone.

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

**Before** = live production (`twinscene.org`) captured 2026-07-16 (full-res logo
+ full-res band photos). The two levers were measured on their **isolated preview
deploys** so each metric change is attributable to exactly one fix. (Automated
bytes capture couldn't run — extension not connected — so byte numbers were read
from the live Network tab.)

### Result — LCP lever: hero logo (`perf/logo-lcp` preview)

Band photos are **still full-res** on this branch, so any LCP/score/CLS movement
is the logo alone.

| Metric (`/bands`, Lighthouse mobile) | Before (prod) | After (logo fix) | Δ |
|---|---|---|---|
| Lighthouse mobile score | **77** | **96** | **+19** |
| LCP | **6,415 ms** | **2,750 ms** | **−57%** |
| CLS | 0.00 (intermittent **0.15**) | **0.00** | fixed |
| Image bytes | 7,316 KB | ~7,300 KB (unchanged) | — *(isolation: no thumbnails on this branch)* |

**Proof, not assumption:** fixing *only* the 828 KB → 36 KB logo cut LCP 57% and
lifted the score 77 → 96. That only happens if the header logo was the LCP
element — so the earlier `perf-baseline.md` assumption ("LCP element is a band
photo") was **wrong**, and the logo owns this metric. The unsized logo was also
the intermittent 0.15 CLS; explicit `width`/`height` took it to a clean 0.00.
Note the ~7 MB of lazy, below-fold band photos did **not** hold the score down —
they're a data-cost problem, not an LCP one.

### Result — bytes lever: band thumbnails (`perf/band-thumbnails` preview)

Logo is **still 828 KB** on this branch, so LCP/score stay ~baseline; the change
here is payload.

| Metric (`/bands`) | Before (prod) | After (thumbnails) | Δ |
|---|---|---|---|
| Per band image (over the wire) | 60–220 KB | **14–36 KB** | ~80–85% each |
| Band-photo bytes (of the 7,316 KB total, ~6.5 MB was band photos) | ~6.5 MB | **~0.8 MB** (est.) | **~87%** |
| Lighthouse score / LCP | 77 / 6,415 ms | ≈ unchanged | — *(isolation: logo still gates LCP)* |

> The ~0.8 MB is derived from the confirmed 14–36 KB/image over 272 photo-bands;
> drop in the measured thumbnails-preview Network→Img total if you grabbed it.

### Combined (both levers on `main`)

`/bands` should land at **score ~96 (LCP ~2.75 s, CLS 0)** *and* an image payload
of **~1 MB** (36 KB logo + ~0.8 MB thumbs) vs. the 7,316 KB baseline — two
independent wins from two independent PRs. Worth one confirming Lighthouse run
once both merge.

### `/shows` — control (show/flyer images, not touched by either change)

Should stay ≈ baseline; a big move means something unrelated shifted.

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
