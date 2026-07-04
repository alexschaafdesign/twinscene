/**
 * Shows support for the TCMS submission backend (show-centric schema).
 *
 * This file contains ONLY the show-related additions. Merge into your existing
 * Code.gs (bound to the spreadsheet) — `doPost`, `getSheet_()`, `todayString_()`,
 * `jsonOutput_()`, `NOTIFY_EMAIL`, and `INDEX_SHEET_NAME` already live there.
 * See the doPost wire-up note at the bottom.
 *
 * SCHEMA: one row per SHOW (not per band). A show links to any number of
 * directory bands via a comma-separated BAND_SLUGS column.
 */

var SHOWS_SHEET_NAME = 'Shows';
var SHOWS_HEADERS = [
  'DATE',
  'VENUE',
  'TITLE',
  'LINEUP',
  'BAND_SLUGS',
  'NOTES',
  'LINK',
  'SOURCE',
  'SOURCE_KEY',
  'ADDED',
];

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

function trim_(v) {
  return (v == null ? '' : v).toString().trim();
}

function splitTrim_(s) {
  return trim_(s)
    .split(',')
    .map(function (x) {
      return x.trim();
    })
    .filter(String);
}

/**
 * Insert or update a single show row, keyed by SOURCE_KEY. When sourceKey is
 * non-empty and an existing row has the same key, that row is overwritten
 * (idempotent re-imports / edits); otherwise a new row is appended. Values are
 * placed by header name, so column order in the sheet doesn't matter.
 *
 * @param {Object} fields  Map of UPPERCASE header -> value.
 * @param {string} sourceKey  Dedup key; '' to always append.
 */
function upsertShowRow_(fields, sourceKey) {
  var sheet = getShowsSheet_();
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

  if (sourceKey) {
    var keyIdx = headers.indexOf('SOURCE_KEY');
    var last = sheet.getLastRow();
    if (keyIdx >= 0 && last > 1) {
      var keys = sheet.getRange(2, keyIdx + 1, last - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) {
        if (keys[i][0].toString().trim() === sourceKey) {
          sheet.getRange(i + 2, 1, 1, headers.length).setValues([row]);
          return;
        }
      }
    }
  }
  sheet.appendRow(row);
}

/**
 * Slugify a band name. Kept in sync with slugify() in lib/fetchBands.ts.
 * (If your script already has an equivalent, reuse that.)
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
 * Optional inline shows attached to a band submission (p.shows = JSON array of
 * {date, venue, notes, link}). One show row each, linked to the band.
 */
function appendShows_(bandSlug, bandName, showsRaw) {
  if (!showsRaw) return;
  var shows;
  try {
    shows = JSON.parse(showsRaw);
  } catch (err) {
    return;
  }
  if (!Array.isArray(shows) || shows.length === 0) return;

  var added = todayString_();
  shows.forEach(function (show) {
    if (!show) return;
    var date = trim_(show.date);
    var venue = trim_(show.venue);
    if (!date && !venue) return;
    upsertShowRow_(
      {
        DATE: date,
        VENUE: venue,
        TITLE: bandName || '',
        LINEUP: bandName || '',
        BAND_SLUGS: bandSlug || '',
        NOTES: trim_(show.notes),
        LINK: trim_(show.link),
        SOURCE: 'manual',
        SOURCE_KEY: '',
        ADDED: added,
      },
      '',
    );
  });
}

/**
 * Manual show submission from the "Add a Show" form (p.formType === 'show').
 * Writes ONE show row linking the selected directory bands, optionally creating
 * a brand-new band in the Index tab, and emails a notification.
 */
function handleShowSubmission_(p) {
  var date = trim_(p.date);
  var venue = trim_(p.venue);
  var notes = trim_(p.notes);
  var link = trim_(p.link);
  var submitterName = trim_(p.submitterName);
  var submitterEmail = trim_(p.submitterEmail);

  var slugs = splitTrim_(p.bandSlugs);
  var names = splitTrim_(p.bandNames);

  // New band added inline: create it in the directory and link it.
  var newBandName = trim_(p.newBandName);
  if (newBandName) {
    var newSlug = slugify_(newBandName);
    names.push(newBandName);
    slugs.push(newSlug);
    addBandToIndex_({
      NAME: newBandName,
      SLUG: newSlug,
      GENRES: trim_(p.newBandGenres),
      LOCATION: trim_(p.newBandLocation),
      CONTACT_EMAIL: trim_(p.newBandContactEmail),
      INSTAGRAM: trim_(p.newBandInstagram),
      ADDED: todayString_(),
    });
  }

  var title = names[0] || venue;
  var lineup = names.join(', ');

  upsertShowRow_(
    {
      DATE: date,
      VENUE: venue,
      TITLE: title,
      LINEUP: lineup,
      BAND_SLUGS: slugs.join(','),
      NOTES: notes,
      LINK: link,
      SOURCE: 'manual',
      SOURCE_KEY: '',
      ADDED: todayString_(),
    },
    '',
  );

  var subject = '[TCMS] New show added: ' + venue + ' on ' + date;
  var body = [
    'Show: ' + (lineup || title),
    'Venue: ' + venue,
    'Date: ' + date,
    'Notes: ' + (notes || '—'),
    'Link: ' + (link || '—'),
    '',
    'Submitted by: ' + submitterName + ' <' + submitterEmail + '>',
  ].join('\n');
  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);

  return jsonOutput_({ success: true });
}

/**
 * Scraper import (p.formType === 'showImport'). Upserts one show row keyed by
 * SOURCE_KEY so re-scraping / re-confirming edits the same row instead of
 * duplicating. No email (imports are done in bulk).
 */
function handleShowImport_(p) {
  var date = trim_(p.date);
  var title = trim_(p.title);
  if (!date || !title) {
    return jsonOutput_({ success: false, error: 'Missing date or title' });
  }

  upsertShowRow_(
    {
      DATE: date,
      VENUE: trim_(p.venue),
      TITLE: title,
      LINEUP: trim_(p.lineup),
      BAND_SLUGS: trim_(p.bandSlugs),
      NOTES: trim_(p.notes),
      LINK: trim_(p.link),
      SOURCE: trim_(p.source) || 'scrape',
      SOURCE_KEY: trim_(p.sourceKey),
      ADDED: todayString_(),
    },
    trim_(p.sourceKey),
  );

  return jsonOutput_({ success: true });
}

/*
 * ── Wire-up in your existing doPost(e) ──────────────────────────────────────
 *
 *      function doPost(e) {
 *        var p = e.parameter;
 *
 *        if (p.formType === 'show')       return handleShowSubmission_(p);
 *        if (p.formType === 'showImport') return handleShowImport_(p);
 *
 *        // ... existing band submission flow ...
 *        // (after writing the band row) appendShows_(p.bandSlug, p.bandName, p.shows);
 *      }
 *
 * ── If todayString_() isn't already defined: ────────────────────────────────
 *
 *      function todayString_() {
 *        return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
 *      }
 */
