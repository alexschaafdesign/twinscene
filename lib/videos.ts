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
  status: "auto" | "review" | "created" | "manual";
  created_at: string;
}

// 'review' rows are unconfirmed scraper matches (medium-confidence title
// parsing) awaiting a human look — never shown on a band's live profile.
const VISIBLE_STATUSES = ["auto", "manual"] as const;

/** Videos to actually render on a band's profile page, by slug. */
export async function getVisibleVideosBySlug(slug: string): Promise<VideoRow[]> {
  return sql<VideoRow[]>`
    select v.*
    from videos v
    join bands b on b.id = v.band_id
    where b.slug = ${slug} and v.status in ${sql(VISIBLE_STATUSES)}
    order by v.published_date desc nulls last, v.created_at desc
  `;
}

/** Slugs of every band with at least one visible video, for the "has videos"
 * directory filter. */
export async function getSlugsWithVideos(): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    select distinct b.slug
    from videos v
    join bands b on b.id = v.band_id
    where v.status in ${sql(VISIBLE_STATUSES)}
  `;
  return rows.map((r) => r.slug);
}

/** Every video row for a band (any status), used to seed the edit form so a
 * submitter can also remove a scraper-matched video, not just their own. */
export async function getAllVideosForBand(bandId: number): Promise<VideoRow[]> {
  return sql<VideoRow[]>`
    select * from videos
    where band_id = ${bandId}
    order by published_date desc nulls last, created_at desc
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

/** Remove videos from a band, scoped to that band's own rows so a correction
 * can't delete another band's video by guessing an id. */
export async function removeVideos(bandId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    delete from videos where band_id = ${bandId} and id in ${sql(ids)}
  `;
}
