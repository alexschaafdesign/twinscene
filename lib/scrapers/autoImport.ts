// Auto-import a high-confidence matched show into the Shows sheet.
//
// Mirrors the payload the manual import review page POSTs (formType
// 'showImport'), so an auto-imported show and a hand-confirmed one produce the
// same row — and share a SOURCE_KEY, so re-running the scraper upserts rather
// than duplicating.

import type { MatchedShow } from "@/lib/bandMatcher";

/** Lowercase/hyphenate for a stable dedup key. Mirrors slugify elsewhere. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Logistics-only NOTES (doors/music times, prices), matching the import page. */
function composeNotes(show: MatchedShow): string {
  const parts: string[] = [];
  const times: string[] = [];
  if (show.doorsTime) times.push(`Doors ${show.doorsTime}`);
  if (show.musicTime) times.push(`Music ${show.musicTime}`);
  if (times.length) parts.push(times.join(" / "));
  const prices: string[] = [];
  if (show.advancePrice != null) prices.push(`$${show.advancePrice} adv`);
  if (show.dosPrice != null) prices.push(`$${show.dosPrice} dos`);
  if (prices.length) parts.push(prices.join(" / "));
  return parts.join(" · ");
}

export async function autoImportShow(
  show: MatchedShow,
  scraperId: string,
  submitUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const title = show.headliner || show.allBands[0] || "";
  const lineup = show.allBands.join(", ");
  const sourceKey = `${scraperId}:${show.date}:${slugify(
    show.headliner || show.allBands[0] || "unknown",
  )}`;

  // Only the confidently-matched directory bands get linked automatically.
  const bandSlugs = show.bandMatches
    .filter((m) => m.confidence === "auto" && m.match)
    .map((m) => m.match!.slug)
    .join(",");

  try {
    const payload = new URLSearchParams({
      formType: "showImport",
      source: scraperId,
      sourceKey,
      date: show.date ?? "",
      venue: show.venue,
      title,
      lineup,
      bandSlugs,
      notes: composeNotes(show),
      link: show.ticketUrl ?? "",
    });

    const res = await fetch(submitUrl, { method: "POST", body: payload });
    const data = await res.json();
    if (!data.success) {
      return { success: false, error: data.error || "Import failed" };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Import request failed",
    };
  }
}
