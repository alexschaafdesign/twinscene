// Pull Birdhaus's band-tagged live-set videos into Twin Scene's `videos` table
// so they surface on the matching band's profile — the same way the
// UnderCurrentMPLS backfill and manual submissions do (lib/videos.ts).
//
// This is a PULL, by design. ARCHITECTURE.md: Birdhaus never pushes to Twin
// Scene (an earlier push-based enrichment flow flooded the directory with
// ~1,450 stub bands). Twin Scene already reads Birdhaus's separate Neon DB
// directly for the Birdhaus show scraper (lib/birdhausDb.ts,
// BIRDHAUS_DATABASE_URL); this reuses that exact connection.
//
// Mapping across the two DBs:
//   Birdhaus videos  ⋈ band_videos ⋈ bands.twin_scene_band_id  →  TS bands.id
//                    ⋈ show_videos ⋈ shows.slug                →  credit link
// A Birdhaus band with no twin_scene_band_id (the handful of Birdhaus-only
// bands) has nowhere to land on Twin Scene, so its videos are skipped.
//
// Idempotent: TS `videos.video_url` is globally unique. Re-running refreshes
// only the rows this importer owns (status = 'birdhaus') — title/band/source
// can drift as Birdhaus edits them — and never touches a row's `hidden` /
// `position` (a band's own profile choices) or a collision with an
// UnderCurrentMPLS/manual row of the same URL.

import { sql } from "./db.ts";
import { getBirdhausDb } from "./birdhausDb.ts";

const SHOW_PAGE_BASE = "https://thebirdhaus.org/shows";

type BirdhausVideoRow = {
  youtube: string;
  title: string;
  twin_scene_band_id: number;
  show_slug: string | null;
};

export interface ImportBirdhausVideosResult {
  /** Rows read from Birdhaus that map to a Twin-Scene-linked band. */
  candidates: number;
  /** Candidates whose twin_scene_band_id actually exists in TS `bands`. */
  eligible: number;
  /** Rows inserted or refreshed (only meaningful when confirm is true). */
  written: number;
  /** twin_scene_band_ids referenced by Birdhaus that no longer exist here. */
  danglingBandIds: number[];
  dryRun: boolean;
}

/**
 * Import Birdhaus band videos into Twin Scene's `videos` table.
 *
 * Dry-run by default (mirrors scripts/undercurrent-backfill.ts): it always
 * reads and reports, and only writes when `confirm` is true.
 */
export async function importBirdhausVideos(
  { confirm = false }: { confirm?: boolean } = {},
): Promise<ImportBirdhausVideosResult> {
  const birdhaus = getBirdhausDb();

  // One row per Birdhaus video that (a) is tagged to at least one band with a
  // Twin Scene link and (b) belongs to a show. Both fan-outs are collapsed with
  // LATERAL ... LIMIT 1 so a video with several bands/shows yields a single
  // row: its lowest-sort_order linked band, and its earliest show for the
  // credit link. Matches how Birdhaus itself renders one band per video.
  const rows = await birdhaus<BirdhausVideoRow[]>`
    select
      v.youtube,
      v.title,
      bnd.twin_scene_band_id,
      shw.slug as show_slug
    from videos v
    join lateral (
      select b.twin_scene_band_id
      from band_videos bv
      join bands b on b.id = bv.band_id
      where bv.video_id = v.id and b.twin_scene_band_id is not null
      order by bv.sort_order asc, bv.band_id asc
      limit 1
    ) bnd on true
    left join lateral (
      select s.slug
      from show_videos sv
      join shows s on s.id = sv.show_id
      where sv.video_id = v.id
      order by s.date asc
      limit 1
    ) shw on true
  `;

  const candidates = rows.length;

  // Guard the FK: a twin_scene_band_id on a Birdhaus row could point at a TS
  // band that's since been deleted/merged. Filter to ids that still exist here
  // rather than letting the insert blow up on a foreign-key violation.
  const referencedIds = [...new Set(rows.map((r) => r.twin_scene_band_id))];
  const existing =
    referencedIds.length === 0
      ? []
      : await sql<{ id: number }[]>`
          select id from bands where id in ${sql(referencedIds)}
        `;
  const existingIds = new Set(existing.map((r) => r.id));
  const danglingBandIds = referencedIds.filter((id) => !existingIds.has(id));

  const eligibleRows = rows.filter((r) => existingIds.has(r.twin_scene_band_id));
  const eligible = eligibleRows.length;

  let written = 0;
  if (confirm) {
    for (const row of eligibleRows) {
      const videoUrl = `https://www.youtube.com/watch?v=${row.youtube}`;
      const sourceUrl = row.show_slug ? `${SHOW_PAGE_BASE}/${row.show_slug}` : null;
      // ON CONFLICT scoped to our own rows: a URL already held by an 'auto' /
      // 'manual' row is left untouched (the WHERE fails the DO UPDATE, so it's
      // a no-op), and hidden/position are never in the SET.
      const result = await sql`
        insert into videos (band_id, video_title, video_url, source_url, status, match_score)
        values (${row.twin_scene_band_id}, ${row.title}, ${videoUrl}, ${sourceUrl}, 'birdhaus', null)
        on conflict (video_url) do update
          set band_id = excluded.band_id,
              video_title = excluded.video_title,
              source_url = excluded.source_url
          where videos.status = 'birdhaus'
      `;
      written += result.count;
    }
  }

  return { candidates, eligible, written, danglingBandIds, dryRun: !confirm };
}
