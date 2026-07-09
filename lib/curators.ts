import type { StarredNote } from "@/lib/fetchShows";

// Curator ids (as written into the Shows sheet's STARRED_BY column) -> display
// name. Add an entry here whenever a new curator-digest source is wired up
// (see lib/scrapers/starCrawlSpace.ts and kin).
const CURATOR_NAMES: Record<string, string> = {
  crawlspace: "crawl space",
};

function curatorName(id: string): string {
  return CURATOR_NAMES[id] ?? id;
}

export type CuratorNote = { id: string; name: string; blurb: string; url: string };

/** Pairs each curator who starred a show with their blurb/link, if given. */
export function curatorNotes(
  starredBy: string[],
  starredNotes: Record<string, StarredNote>,
): CuratorNote[] {
  return starredBy.map((id) => ({
    id,
    name: curatorName(id),
    blurb: starredNotes[id]?.blurb ?? "",
    url: starredNotes[id]?.url ?? "",
  }));
}
