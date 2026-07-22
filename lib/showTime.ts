// Conversions between the scrapers' display time strings ("7:00pm") and the
// `time` values stored in shows.music_time / shows.doors_time (migration 0039).
//
// Scrapers all normalize to a "h:mm" + am/pm shape (see each scraper's
// formatTime), so parseDisplayTime turns that into 24-hour "HH:MM" for the DB;
// formatShowTime turns the DB's "HH:MM"/"HH:MM:SS" back into the same display
// string the UI has always shown. Both are tolerant of null and of a missing
// minutes field ("7pm"), and return null on anything they don't recognize
// rather than guessing — a bad parse should drop the time, not invent one.

const DISPLAY_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m$/i;

/** "7:00pm" / "7pm" -> "19:00" (24h, for a Postgres `time`); null if unparseable. */
export function parseDisplayTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = DISPLAY_RE.exec(raw.trim());
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12; // 12am -> 0, 12pm -> 0 (+12 below)
  if (/p/i.test(m[3])) hour += 12;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${m[2] ?? "00"}`;
}

/** Validate/normalize a 24-hour "HH:MM" clock string (what an <input type=
 * "time"> posts) for a Postgres `time` column: "19:00" -> "19:00", ""/garbage
 * -> null. Distinct from parseDisplayTime, which takes the scrapers' "7:00pm". */
export function sqlTimeOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

/** "19:00" / "19:00:00" -> "7:00pm"; null if empty/unparseable. Mirrors the
 * scrapers' formatTime output so structured times render identically. */
export function formatShowTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const h24 = parseInt(m[1], 10);
  if (Number.isNaN(h24) || h24 > 23) return null;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 || 12;
  return `${h12}:${m[2]}${suffix}`;
}

/** A one-line label from already-formatted display times (Show.musicTime /
 * doorsTime, "" when unknown): "Doors 7:00pm · Show 8:00pm", or just one side,
 * or "" when neither is known. Shared by the timeline and the show page. */
export function showTimeLabel(show: { musicTime: string; doorsTime: string }): string {
  const parts: string[] = [];
  if (show.doorsTime) parts.push(`Doors ${show.doorsTime}`);
  if (show.musicTime) parts.push(`Show ${show.musicTime}`);
  return parts.join(" · ");
}

/** Pull a "Music 7:00pm" / "Doors 6:30pm" style time out of a show's free-text
 * notes — the scrapers currently write times there rather than into the
 * structured music_time/doors_time columns (which are almost always empty). */
function timeFromNotes(notes: string, label: "Music" | "Doors"): string {
  const m = new RegExp(`${label}\\s+(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m)`, "i").exec(notes);
  return m ? m[1].replace(/\s+/g, "") : "";
}

/** A show's best-guess start time for a compact list's time column: the
 * structured music_time when set, else doors_time, else the "Music …"/"Doors …"
 * time embedded in the notes. Returns "" when no time is discoverable. */
export function showStartTime(show: {
  musicTime: string;
  doorsTime: string;
  notes: string;
}): string {
  if (show.musicTime) return show.musicTime;
  if (show.doorsTime) return show.doorsTime;
  return timeFromNotes(show.notes, "Music") || timeFromNotes(show.notes, "Doors");
}
