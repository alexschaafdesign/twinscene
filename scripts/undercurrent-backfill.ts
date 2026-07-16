// One-time backfill: fetch every video from the UnderCurrentMPLS YouTube
// channel, parse a candidate band name out of each title, match it against
// Twin Scene's own band directory (lib/bands.ts), and insert matches into the
// `videos` table (migrations 0012_create_videos.sql, 0013_videos_allow_
// created_bands.sql).
//
// A parsed name that matches nothing in the directory can optionally be
// "soft created" instead of just logged and skipped, via --create-bands:
// lib/bands.ts's findOrCreateBandByName() creates a new `unreviewed = true`
// band (the same mechanism Birdhaus's write-capable scraper client already
// uses for unmatched lineup entries), the video is linked to it, and the row
// is tagged status='created' so it's easy to tell apart from a confident or
// uncertain match against a band that already existed. Off by default:
// unreviewed bands aren't filtered anywhere in the app yet, so ~3,000 of them
// would show up live immediately (same as any other scraper-created band
// today, just a lot more of them at once) — opt in deliberately with
// --create-bands once you're ready for that.
//
// The video-fetching and title-parsing logic below is written so it could be
// lifted into a proper lib/scrapers/ module later if this becomes an ongoing
// job — it's a standalone script only because this pass is one-time.
//
// DRY-RUN BY DEFAULT, matching scripts/migrate/*.mjs — it always fetches,
// parses, matches, and writes the local JSON outputs below, but only writes
// to the DB with --confirm.
//
// Usage (from the Twin Scene repo root; Node >= 23 executes TypeScript
// directly):
//   node scripts/undercurrent-backfill.ts                          # dry-run
//   node scripts/undercurrent-backfill.ts --confirm                 # insert auto+review matches only
//   node scripts/undercurrent-backfill.ts --confirm --create-bands   # also soft-create bands for unmatched names
//   node scripts/undercurrent-backfill.ts --refetch                  # bypass the raw-video cache
//
// Local-only output (gitignored, not written to any Sheet — Sheets is retired):
//   undercurrent-videos-raw.json  — cached raw fetched video list
//   review-queue.json             — medium-confidence matches, to eyeball
//   unmatched.json                 — parsed names with no directory match
//                                    (only become new unreviewed bands with --create-bands)
//   unparsed.json                  — titles that fit neither parsing rule
//
// Note: inserting a videos row only associates it with a band in the
// database (band_id FK) — nothing in the app reads from the videos table yet,
// so this alone does not make anything appear on a band's profile page.
// That's a separate follow-up (this backfill is DB-only, per spec).
//
// Idempotency: `videos.video_url` is unique; inserts use ON CONFLICT DO
// NOTHING, so re-running against the same video list (or a superset of it)
// never duplicates rows. findOrCreateBandByName is itself idempotent by
// case-insensitive name, so re-running never creates a duplicate band either
// — a name created on one run is just found and reused on the next.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmTarget, parseArgs } from "./migrate/_safety.mjs";
import { createMatcher } from "../lib/bandMatcher.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

const CHANNEL_HANDLE = "@UnderCurrentMPLS";
const RAW_CACHE_PATH = join(REPO_ROOT, "undercurrent-videos-raw.json");
const REVIEW_QUEUE_PATH = join(REPO_ROOT, "review-queue.json");
const UNMATCHED_PATH = join(REPO_ROOT, "unmatched.json");
const UNPARSED_PATH = join(REPO_ROOT, "unparsed.json");

type RawVideo = {
  videoId: string;
  title: string;
  publishedAt: string; // ISO 8601, e.g. "2023-12-08T04:00:00Z"
  url: string;
};

// --- 1. Fetch every video from the channel's uploads playlist -------------

async function youtubeGet(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${path} failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function resolveUploadsPlaylistId(apiKey: string): Promise<string> {
  const body = await youtubeGet(
    "channels",
    { part: "contentDetails", forHandle: CHANNEL_HANDLE },
    apiKey,
  );
  const uploads = body?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (typeof uploads !== "string" || !uploads) {
    throw new Error(
      `Could not resolve uploads playlist for ${CHANNEL_HANDLE} — check the handle and API key.`,
    );
  }
  return uploads;
}

async function fetchAllVideos(apiKey: string): Promise<RawVideo[]> {
  const uploadsPlaylistId = await resolveUploadsPlaylistId(apiKey);
  console.log(`Uploads playlist: ${uploadsPlaylistId}`);

  const videos: RawVideo[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    page += 1;
    const body = await youtubeGet(
      "playlistItems",
      {
        part: "snippet",
        playlistId: uploadsPlaylistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );

    for (const item of body.items ?? []) {
      const videoId = item?.snippet?.resourceId?.videoId;
      const title = item?.snippet?.title;
      const publishedAt = item?.snippet?.publishedAt;
      if (typeof videoId !== "string" || typeof title !== "string") continue;
      // Deleted/private uploads surface with this placeholder title — skip them.
      if (title === "Private video" || title === "Deleted video") continue;
      videos.push({
        videoId,
        title,
        publishedAt: typeof publishedAt === "string" ? publishedAt : "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }

    pageToken = body.nextPageToken;
    console.log(`  page ${page}: ${videos.length} videos so far`);
  } while (pageToken);

  return videos;
}

async function loadVideos(apiKey: string, refetch: boolean): Promise<RawVideo[]> {
  if (!refetch && existsSync(RAW_CACHE_PATH)) {
    console.log(`Using cached video list at ${RAW_CACHE_PATH} (pass --refetch to bypass)`);
    return JSON.parse(readFileSync(RAW_CACHE_PATH, "utf8"));
  }

  console.log(`Fetching videos from ${CHANNEL_HANDLE}...`);
  const videos = await fetchAllVideos(apiKey);
  writeFileSync(RAW_CACHE_PATH, JSON.stringify(videos, null, 2) + "\n");
  console.log(`Fetched ${videos.length} videos, cached to ${RAW_CACHE_PATH}`);
  return videos;
}

// --- 2. Parse each title into a candidate band name ------------------------

// Straight and curly DOUBLE-quote variants only: " " ” — deliberately excludes
// ' ‘ ’, since in this corpus a bare apostrophe is essentially always a
// contraction/possessive (venue names like "Palmer's"/"Dusty's", "New Year's
// Eve", "Won't") rather than a delimiter around a song title. Matching those
// as the split point truncated the band name mid-word in ~4% of titles (e.g.
// "Gay Witch Abortion @ Dusty's" → "Gay Witch Abortion @ Dusty"). The rare
// band whose own name carries a single quote (e.g. `The Controversial New
// 'Skinny Pill'`) still comes out right via the @ fallback below.
const QUOTE_CHARS = /["“”]/;

/** Trim whitespace plus stray leading/trailing punctuation left over once the
 * quote/@ marker is sliced off (e.g. a trailing dash before the cut point). */
function trimEdges(s: string): string {
  return s.trim().replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, "").trim();
}

type ParsedTitle = { bandName: string; method: "quote" | "at" } | { bandName: null };

function parseTitle(title: string): ParsedTitle {
  const quoteMatch = title.match(QUOTE_CHARS);
  if (quoteMatch && quoteMatch.index !== undefined && quoteMatch.index > 0) {
    const candidate = trimEdges(title.slice(0, quoteMatch.index));
    if (candidate) return { bandName: candidate, method: "quote" };
  }

  const atIndex = title.indexOf("@");
  if (atIndex > 0) {
    const candidate = trimEdges(title.slice(0, atIndex));
    if (candidate) return { bandName: candidate, method: "at" };
  }

  return { bandName: null };
}

// --- main -------------------------------------------------------------------

async function main() {
  const { confirm, args } = parseArgs(process.argv);
  const refetch = args.includes("--refetch");
  const createBands = args.includes("--create-bands");

  // confirmTarget() loads .env.local and blocks on an explicit "yes", so both
  // DATABASE_URL (needed by the dynamic imports below, which read it at
  // module-evaluation time) and YOUTUBE_API_KEY are guaranteed to be in
  // process.env only after this call — check YOUTUBE_API_KEY after, not before.
  await confirmTarget({
    scriptName: "undercurrent-backfill",
    mode: confirm ? "CONFIRM — WILL INSERT into videos" : "DRY-RUN (no DB writes)",
  });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }

  const { sql } = await import("../lib/db.ts");
  const { getAllBands, findOrCreateBandByName } = await import("../lib/bands.ts");

  try {
    const videos = await loadVideos(apiKey, refetch);

    const bands = await getAllBands();
    console.log(`\nMatching against ${bands.length} bands in the Twin Scene directory.`);
    const { matchBand } = createMatcher(bands);

    type PendingCreate = {
      videoId: string;
      title: string;
      url: string;
      publishedDate: string | null;
      parsedName: string;
    };

    const unparsed: { videoId: string; title: string; url: string }[] = [];
    const pendingCreate: PendingCreate[] = [];
    const reviewQueue: {
      videoId: string;
      title: string;
      url: string;
      publishedDate: string | null;
      parsedName: string;
      matchedBand: string;
      matchedSlug: string;
      score: number;
    }[] = [];
    const toInsert: {
      bandId: number;
      title: string;
      url: string;
      publishedDate: string | null;
      score: number | null;
      status: "auto" | "review" | "created";
    }[] = [];

    for (const video of videos) {
      const publishedDate = video.publishedAt ? video.publishedAt.slice(0, 10) : null;
      const parsed = parseTitle(video.title);

      if (parsed.bandName === null) {
        unparsed.push({ videoId: video.videoId, title: video.title, url: video.url });
        continue;
      }

      const result = matchBand(parsed.bandName);

      if (result.confidence === "none" || !result.match) {
        pendingCreate.push({
          videoId: video.videoId,
          title: video.title,
          url: video.url,
          publishedDate,
          parsedName: parsed.bandName,
        });
        continue;
      }

      toInsert.push({
        bandId: result.match.id,
        title: video.title,
        url: video.url,
        publishedDate,
        score: result.score,
        status: result.confidence,
      });

      if (result.confidence === "review") {
        reviewQueue.push({
          videoId: video.videoId,
          title: video.title,
          url: video.url,
          publishedDate,
          parsedName: parsed.bandName,
          matchedBand: result.match.name,
          matchedSlug: result.match.slug,
          score: result.score,
        });
      }
    }

    // Dedupe by case-insensitive name so 30 videos titled by the same unmatched
    // band create exactly one new band, not 30 — mirrors
    // findOrCreateBandByName's own case-insensitive lookup.
    const uniqueCreateNames = new Map<string, string>(); // lower -> first-seen casing
    for (const p of pendingCreate) {
      const key = p.parsedName.toLowerCase();
      if (!uniqueCreateNames.has(key)) uniqueCreateNames.set(key, p.parsedName);
    }

    writeFileSync(UNPARSED_PATH, JSON.stringify(unparsed, null, 2) + "\n");
    writeFileSync(UNMATCHED_PATH, JSON.stringify(pendingCreate, null, 2) + "\n");
    writeFileSync(REVIEW_QUEUE_PATH, JSON.stringify(reviewQueue, null, 2) + "\n");

    console.log("\n================ SUMMARY ================");
    console.log(`Total videos:         ${videos.length}`);
    console.log(`Unparsed titles:      ${unparsed.length}  -> ${UNPARSED_PATH}`);
    console.log(`Auto-tier matches:    ${toInsert.filter((r) => r.status === "auto").length}`);
    console.log(`Review-tier matches:  ${reviewQueue.length}  -> ${REVIEW_QUEUE_PATH}`);
    console.log(
      `Unmatched videos:     ${pendingCreate.length} (${uniqueCreateNames.size} unique names) -> ${UNMATCHED_PATH}`,
    );
    if (!createBands) {
      console.log(
        `  not creating bands for these (pass --create-bands to enable) — only auto/review rows will be written`,
      );
    } else {
      console.log(
        confirm
          ? `  these will create ${uniqueCreateNames.size} new unreviewed bands`
          : `  --confirm --create-bands would create ${uniqueCreateNames.size} new unreviewed bands from these`,
      );
    }
    console.log("===========================================");

    if (!confirm) {
      console.log("\nDRY-RUN complete. No rows were written to the DB, no bands were created.");
      console.log("Review the JSON outputs above, then re-run with --confirm to write.");
      return;
    }

    if (createBands) {
      // Resolve/create one band per unique unmatched name, then attach every
      // video that parsed to that name to the same band.
      const createdBandIds = new Map<string, number>(); // lower name -> band id
      let bandsCreated = 0;
      let bandsMatchedExisting = 0;
      for (const [key, name] of uniqueCreateNames) {
        const { band, matched } = await findOrCreateBandByName(name);
        createdBandIds.set(key, band.id);
        if (matched) bandsMatchedExisting += 1;
        else bandsCreated += 1;
      }
      console.log(
        `\nBands: created ${bandsCreated} new unreviewed bands, ${bandsMatchedExisting} unmatched names resolved to an existing band (race/synonym).`,
      );

      for (const p of pendingCreate) {
        const bandId = createdBandIds.get(p.parsedName.toLowerCase());
        if (bandId === undefined) continue; // unreachable — every pendingCreate name was resolved above
        toInsert.push({
          bandId,
          title: p.title,
          url: p.url,
          publishedDate: p.publishedDate,
          score: null,
          status: "created",
        });
      }
    }

    let inserted = 0;
    let skipped = 0;
    for (const row of toInsert) {
      const result = await sql`
        insert into videos (band_id, video_title, video_url, published_date, match_score, status)
        values (${row.bandId}, ${row.title}, ${row.url}, ${row.publishedDate}, ${row.score}, ${row.status})
        on conflict (video_url) do nothing
      `;
      if (result.count > 0) inserted += 1;
      else skipped += 1;
    }

    console.log(`\nInserted ${inserted} rows (${skipped} already present, skipped by ON CONFLICT).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
