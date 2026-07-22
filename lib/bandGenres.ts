// Persists Bandcamp genre tags into the canonical `genres`/`band_genres`
// tables (0047_bandcamp_genres.sql). Sits between the pure scrape/normalize
// functions (lib/scrapers/bandcampGenres.ts) and the places a band's
// Bandcamp links get written (lib/bands.ts's upsertBand/updateBandLinks/
// updateBandMusic) — those call triggerBandGenreScrape fire-and-forget
// whenever a bandcamp link is newly set or changed.
//
// Confidence tier decides visibility, not a separate status column: `high`
// rows are read back by getHighConfidenceBandGenres and shown on the band
// page; `medium`/`low` rows are stored (for a future review queue / audit)
// but nothing currently reads them out.

import { sql } from "./db.ts";
import {
  fetchBandcampTags,
  normalizeGenres,
  type NormalizedGenre,
} from "./scrapers/bandcampGenres.ts";

async function canonicalGenreNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`select name from genres order by name`;
  return rows.map((r) => r.name);
}

async function saveMappedGenres(
  bandId: number,
  mapped: NormalizedGenre[],
  source: string,
): Promise<void> {
  for (const m of mapped) {
    await sql`
      insert into band_genres (band_id, genre_id, source, raw_tag, confidence)
      select ${bandId}, g.id, ${source}, ${m.rawTag}, ${m.confidence}
      from genres g where g.name = ${m.genre}
      on conflict (band_id, genre_id, source) do update set
        raw_tag = excluded.raw_tag,
        confidence = excluded.confidence
    `;
  }
}

export type ScrapeBandGenresResult = {
  bandId: number;
  mapped: NormalizedGenre[];
  dropped: string[];
  // Set when a stored URL turned out to be an artist landing page and the
  // scraper followed to its first release instead — surfaced so a backfill
  // summary can flag it rather than it passing silently.
  followedArtistPages: string[];
};

/**
 * Scrape one band's Bandcamp URL(s), normalize the combined tag set, and
 * upsert into band_genres. Multiple URLs (e.g. both the "links" bandcampLink
 * and the "music" album/track link) are deduped into one combined tag list
 * before normalization, per band, rather than normalized separately.
 */
export async function scrapeAndSaveBandGenres(
  bandId: number,
  urls: string[],
  source = "bandcamp",
): Promise<ScrapeBandGenresResult> {
  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  const empty = { bandId, mapped: [], dropped: [], followedArtistPages: [] };
  if (uniqueUrls.length === 0) return empty;

  const allTags = new Set<string>();
  const followedArtistPages: string[] = [];
  for (const url of uniqueUrls) {
    const { tags, sourceUrl, followedFromArtistPage } = await fetchBandcampTags(url);
    if (followedFromArtistPage) followedArtistPages.push(`${url} -> ${sourceUrl}`);
    for (const t of tags) allTags.add(t);
  }
  if (allTags.size === 0) return { ...empty, followedArtistPages };

  const canonicalGenres = await canonicalGenreNames();
  const { mapped, dropped } = await normalizeGenres(Array.from(allTags), canonicalGenres);
  await saveMappedGenres(bandId, mapped, source);

  return { bandId, mapped, dropped, followedArtistPages };
}

/**
 * Fire-and-forget wrapper for the request path (band-edit handlers). Never
 * throws into the caller — logs and swallows any failure, since a failed
 * genre scrape shouldn't affect the save the caller is actually handling.
 */
export function triggerBandGenreScrape(bandId: number, urls: string[]): void {
  if (urls.filter(Boolean).length === 0) return;
  scrapeAndSaveBandGenres(bandId, urls).then(
    (result) => {
      if (result.dropped.length > 0) {
        console.log(`[bandGenres] band ${result.bandId}: dropped tags — ${result.dropped.join(", ")}`);
      }
      for (const followed of result.followedArtistPages) {
        console.log(`[bandGenres] band ${result.bandId}: artist page, followed ${followed}`);
      }
    },
    (err) => {
      console.error(`[bandGenres] scrape failed for band ${bandId}:`, err);
    },
  );
}

/** High-confidence canonical genres for a band, for read-only display. */
export async function getHighConfidenceBandGenres(bandId: number): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select distinct g.name
    from band_genres bg
    join genres g on g.id = bg.genre_id
    where bg.band_id = ${bandId} and bg.confidence = 'high'
    order by g.name
  `;
  return rows.map((r) => r.name);
}
