/**
 * Shows support for the TCMS submission backend.
 *
 * This file contains ONLY the additions needed to persist upcoming shows.
 * Merge these into your existing Code.gs (bound to the spreadsheet) — the
 * `doPost` handler and helpers like `getSheet_()` / `todayString_()` already
 * live there. See the doPost note at the bottom for the one line to add.
 */

var SHOWS_SHEET_NAME = 'Shows';
var SHOWS_HEADERS = ['SLUG', 'BAND_NAME', 'DATE', 'VENUE', 'NOTES', 'LINK', 'ADDED'];

/**
 * Return the "Shows" sheet, creating it (with headers) if it doesn't exist.
 * Mirrors getSheet_() for the Index tab.
 */
function getShowsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHOWS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHOWS_SHEET_NAME);
    sheet.appendRow(SHOWS_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHOWS_HEADERS);
  }
  return sheet;
}

/**
 * Parse p.shows (a JSON string of show objects) and append one row per show to
 * the Shows tab. Absent/empty/malformed input is ignored — shows are optional
 * and must never fail the overall submission. Existing shows are left alone;
 * dedup/cleanup is manual for now.
 *
 * @param {string} bandSlug  Slug linking the show back to the Index band.
 * @param {string} bandName  Display name for convenience in the sheet.
 * @param {string} showsRaw  p.shows — a JSON array string, or undefined.
 */
function appendShows_(bandSlug, bandName, showsRaw) {
  if (!showsRaw) return;

  var shows;
  try {
    shows = JSON.parse(showsRaw);
  } catch (err) {
    return; // malformed JSON — skip rather than break the submission
  }
  if (!Array.isArray(shows) || shows.length === 0) return;

  var sheet = getShowsSheet_();
  var added = todayString_();

  shows.forEach(function (show) {
    if (!show) return;
    var date = (show.date || '').toString().trim();
    var venue = (show.venue || '').toString().trim();
    // Defensive: the client already drops rows with neither date nor venue.
    if (!date && !venue) return;

    sheet.appendRow([
      bandSlug,
      bandName || '',
      date,
      venue,
      (show.notes || '').toString().trim(),
      (show.link || '').toString().trim(),
      added,
    ]);
  });
}

/*
 * ── Wire-up in your existing doPost(e) ──────────────────────────────────────
 *
 * After writing the band row to the Index sheet, add:
 *
 *     appendShows_(p.bandSlug, p.bandName, p.shows);
 *
 * where `p` is your parsed request params (e.parameter). `p.bandSlug` and
 * `p.bandName` are already sent by the form; `p.shows` is the new JSON field.
 *
 * ── If todayString_() isn't already defined in your script, it looks like: ──
 *
 *     function todayString_() {
 *       return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
 *     }
 */
