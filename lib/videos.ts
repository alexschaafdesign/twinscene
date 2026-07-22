// Data layer for the `videos` table — YouTube videos tied to a band via
// band_id. Rows come from two sources: the one-time UnderCurrentMPLS backfill
// (scripts/undercurrent-backfill.ts, status 'auto'/'review'/'created') and
// hand-entered submissions through the band edit form (status 'manual',
// added below). Read side mirrors lib/bands.ts's raw-SQL style.

import { sql } from "./db";
import { isYoutubeUrl } from "./youtube";

export interface VideoRow {
  id: number;
  band_id: number | null;
  video_title: string;
  video_url: string;
  published_date: string | null;
  match_score: number | null;
  status: "auto" | "review" | "created" | "manual" | "birdhaus";
  created_at: string;
  /** For 'birdhaus' rows, the Birdhaus show page the credit line links to
   * ("Recorded at The Birdhaus"). Null for every other source. Set by
   * lib/importBirdhausVideos.ts. */
  source_url: string | null;
  /** Set/cleared via setVideosHidden — a reversible alternative to deleting
   * the row, so a band can pull a scraper-matched video off their profile
   * without losing it for good (migration 0044). */
  hidden: boolean;
  /** Explicit display order, set via setVideoOrder (migration 0045). Null
   * until a band reorders their videos at least once — until then, the
   * published_date/created_at fallback below is what's actually in effect. */
  position: number | null;
}

// 'review' rows are unconfirmed scraper matches (medium-confidence title
// parsing) awaiting a human look — never shown on a band's live profile.
// 'birdhaus' rows are pulled from Birdhaus's own DB (already human-curated
// there), so they're live like 'auto'/'manual'.
const VISIBLE_STATUSES = ["auto", "manual", "birdhaus"] as const;

/** Videos to actually render on a band's profile page, by slug. */
export async function getVisibleVideosBySlug(slug: string): Promise<VideoRow[]> {
  return sql<VideoRow[]>`
    select v.*
    from videos v
    join bands b on b.id = v.band_id
    where b.slug = ${slug} and v.status in ${sql(VISIBLE_STATUSES)} and not v.hidden
    order by v.position asc nulls last, v.published_date desc nulls last, v.created_at desc
  `;
}

/** Slugs of every band with at least one visible video, for the "has videos"
 * directory filter. */
export async function getSlugsWithVideos(): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    select distinct b.slug
    from videos v
    join bands b on b.id = v.band_id
    where v.status in ${sql(VISIBLE_STATUSES)} and not v.hidden
  `;
  return rows.map((r) => r.slug);
}

/** Every video row for a band (any status), used to seed the edit form so a
 * submitter can also remove a scraper-matched video, not just their own. */
export async function getAllVideosForBand(bandId: number): Promise<VideoRow[]> {
  return sql<VideoRow[]>`
    select * from videos
    where band_id = ${bandId}
    order by position asc nulls last, published_date desc nulls last, created_at desc
  `;
}

/** Best-effort video title via YouTube's public oEmbed endpoint — no API key
 * needed. Returns null on any failure (network error, private/deleted video,
 * non-JSON reply), mirroring lib/ogImage.ts's degrade-gracefully shape. */
export async function resolveYoutubeTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown };
    return typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
  } catch {
    return null;
  }
}

/** Add a hand-entered video to a band. Silently no-ops on a non-YouTube URL or
 * a video_url that's already claimed by any band (video_url is globally
 * unique) — both are treated as non-fatal, matching this form's general
 * best-effort-and-move-on posture. */
export async function addVideo(bandId: number, url: string, label: string): Promise<void> {
  const trimmed = url.trim();
  if (!isYoutubeUrl(trimmed)) return;

  const title = (label.trim() || (await resolveYoutubeTitle(trimmed)) || "Video").slice(0, 500);

  await sql`
    insert into videos (band_id, video_title, video_url, status)
    values (${bandId}, ${title}, ${trimmed}, 'manual')
    on conflict (video_url) do nothing
  `;
}

/** Hide or unhide videos on a band, scoped to that band's own rows so a
 * correction can't touch another band's video by guessing an id. Hiding
 * (rather than deleting) keeps a scraper-matched video recoverable — the
 * band can toggle it back on, and a re-run of the UnderCurrentMPLS backfill
 * still finds its video_url already present. */
export async function setVideosHidden(bandId: number, ids: number[], hidden: boolean): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    update videos set hidden = ${hidden} where band_id = ${bandId} and id in ${sql(ids)}
  `;
}

/** Persist the band's chosen display order — 0-indexed position per id, in
 * the order given. Scoped to the band's own rows (same guard as
 * setVideosHidden). Called on every "correct" save that has existing videos,
 * whether or not the submitter actually touched the reorder buttons — the
 * order the form loaded with (chronological, until first pinned) is the
 * order that gets fixed in place. */
export async function setVideoOrder(bandId: number, orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await sql.begin(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx`update videos set position = ${i} where id = ${orderedIds[i]} and band_id = ${bandId}`;
    }
  });
}
