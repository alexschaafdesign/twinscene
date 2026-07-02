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

/** Recipient for new-show notifications. */
function showNotifyEmail_() {
  return NOTIFY_EMAIL;
}

/**
 * Slugify a band name. Kept in sync with slugify() in lib/fetchBands.ts and
 * SubmitForm.tsx. (If your script already has an equivalent, reuse that.)
 */
function slugify_(name) {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Append a band to the Index tab, placing values by column header so it works
 * regardless of column order. Unlisted headers are left blank.
 *
 * @param {Object} fields  Map of UPPERCASE header name -> value.
 */
function addBandToIndex_(fields) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDEX_SHEET_NAME);
  var lastCol = sheet.getLastColumn();
  var headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function (h) {
      return h.toString().trim().toUpperCase();
    });
  var row = headers.map(function (h) {
    return fields[h] != null ? fields[h] : '';
  });
  sheet.appendRow(row);
}

/**
 * Handle a show submission (p.formType === 'show'). Appends one row per band to
 * the Shows tab, optionally creates a brand-new band in the Index tab, emails a
 * notification, and returns a JSON response via jsonOutput_().
 */
function handleShowSubmission_(p) {
  var date = (p.date || '').toString().trim();
  var venue = (p.venue || '').toString().trim();
  var notes = (p.notes || '').toString().trim();
  var link = (p.link || '').toString().trim();
  var submitterName = (p.submitterName || '').toString().trim();
  var submitterEmail = (p.submitterEmail || '').toString().trim();

  var splitTrim = function (s) {
    return (s || '')
      .toString()
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(String);
  };
  var slugs = splitTrim(p.bandSlugs);
  var names = splitTrim(p.bandNames);

  var showsSheet = getShowsSheet_();
  var added = todayString_();
  var bandSummary = [];

  // Existing bands: one Shows row each.
  for (var i = 0; i < slugs.length; i++) {
    var slug = slugs[i];
    var name = names[i] || slug;
    showsSheet.appendRow([slug, name, date, venue, notes, link, added]);
    bandSummary.push(name);
  }

  // New band added inline: add its show, then create it in the directory.
  var newBandName = (p.newBandName || '').toString().trim();
  if (newBandName) {
    var newSlug = slugify_(newBandName);
    showsSheet.appendRow([newSlug, newBandName, date, venue, notes, link, added]);
    bandSummary.push(newBandName + ' (new)');

    addBandToIndex_({
      NAME: newBandName,
      SLUG: newSlug,
      GENRES: (p.newBandGenres || '').toString().trim(),
      LOCATION: (p.newBandLocation || '').toString().trim(),
      STATUS: 'Active',
      ADDED: added,
    });
  }

  // Notification email.
  var subject = '[TCMS] New show added: ' + venue + ' on ' + date;
  var body = [
    'Bands: ' + (bandSummary.join(', ') || '(none)'),
    'Venue: ' + venue,
    'Date: ' + date,
    'Notes: ' + (notes || '—'),
    'Link: ' + (link || '—'),
    '',
    'Submitted by: ' + submitterName + ' <' + submitterEmail + '>',
  ].join('\n');
  MailApp.sendEmail(showNotifyEmail_(), subject, body);

  return jsonOutput_({ success: true });
}

/*
 * ── Wire-up in your existing doPost(e) ──────────────────────────────────────
 *
 * 1) Route show submissions at the TOP of doPost, before the band flow.
 *    handleShowSubmission_ already returns a jsonOutput_() response, so return
 *    it directly:
 *
 *      function doPost(e) {
 *        var p = e.parameter;
 *
 *        // Show submissions have their own handler.
 *        if (p.formType === 'show') {
 *          return handleShowSubmission_(p);
 *        }
 *
 *        // ... existing band submission flow ...
 *      }
 *
 * 2) In the band flow, after writing the band row to the Index sheet, add:
 *
 *      appendShows_(p.bandSlug, p.bandName, p.shows);
 *
 * ── If todayString_() isn't already defined in your script, it looks like: ──
 *
 *      function todayString_() {
 *        return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
 *      }
 */
