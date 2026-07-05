const SUBMISSIONS_SHEET_NAME = 'Submissions';
const INDEX_SHEET_NAME = 'Index';
const NOTIFY_EMAIL = 'alex@thebirdhaus.org';
const DRIVE_FOLDER_ID = '1U92CcZ2dmpGVTeLUtvjbobEeUBeRAB54';

// R2 credentials
const R2_ACCOUNT_ID = 'db6a4e7726befeb075f651c4121076bd';
const R2_ACCESS_KEY_ID = '6cc0f7d3581b877ba089bf13cd9fea73';
const R2_SECRET_ACCESS_KEY = '60d38f49002df71187d6c82608a61f2efad8162699d026ddc43166d5f3b3814c';
const R2_BUCKET = 'birdhaus';
const R2_PUBLIC_URL = 'https://images.thebirdhaus.org';

const SUBMISSION_COLUMNS = [
  'Timestamp', 'Mode', 'Slug', 'Existing Slug', 'Name', 'Genres', 'Location',
  'Started', 'Status', 'Bio', 'Website', 'Instagram', 'Bandcamp', 'Spotify',
  'Image URL', 'Submitter Name', 'Submitter Email', 'Notes', 'Review Status',
];

const INDEX_COLUMNS = [
  'NAME', 'SLUG', 'GENRES', 'LOCATION', 'BIO', 'STARTED', 'STATUS', 'IMAGE',
  'WEBSITE', 'INSTAGRAM', 'BANDCAMP', 'BANDCAMP_EMBED_URL', 'BANDCAMP_EMBED_HEIGHT', 'SPOTIFY', 'ADDED', 'CONTACT_EMAIL', 'CONTACT_METHOD',
];

function showNotifyEmail_() {
  return NOTIFY_EMAIL;
}

function trim_(v) {
  return (v == null ? '' : v).toString().trim();
}

function doPost(e) {
  try {
    const p = e.parameter;

    if (p.formType === 'show') {
      return handleShowSubmission_(p);
    }

    if (p.formType === 'showImport') {
      return handleShowImport_(p);
    }

    if (p.formType === 'nonLocalBand') return handleNonLocalBand_(p);

    if (p.formType === 'scraperLog') return handleScraperLog_(p);


    let imageUrl = '';
    if (p.imageBase64) {
      imageUrl = saveImageToR2_(p);
    }
    const hasNewImage = !!imageUrl;

    const submissionRow = {
      'Timestamp': new Date(),
      'Mode': p.mode || '',
      'Slug': p.bandSlug || '',
      'Existing Slug': p.existingSlug || '',
      'Name': p.bandName || '',
      'Genres': p.genres || '',
      'Location': p.location || '',
      'Started': p.started || '',
      'Contact Email': p.contactEmail || '',
      'Contact Method': p.contactMethod || '',
      'Bio': p.bio || '',
      'Website': p.website || '',
      'Instagram': p.instagram || '',
      'Bandcamp': p.bandcamp || '',
      'Spotify': p.spotify || '',
      'Image URL': imageUrl,
      'Submitter Name': p.submitterName || '',
      'Submitter Email': p.submitterEmail || '',
      'Notes': p.notes || '',
      'Review Status': 'Published (auto)',
    };
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SUBMISSIONS_SHEET_NAME)
      .appendRow(SUBMISSION_COLUMNS.map(function(c) { return submissionRow[c]; }));

    const result = writeToIndex_(p, imageUrl, hasNewImage);
    appendShows_(p.bandSlug || '', p.bandName || '', p.shows);
    // sendNotification_(p, imageUrl, result);

    return jsonOutput_({ success: true, slug: result.slug, action: result.action });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}


function handleShowSubmission_(p) {
  try {
    var date = trim_(p.date);
    var venue = trim_(p.venue);
    var notes = trim_(p.notes);
    var link = trim_(p.link);
    var submitterName = trim_(p.submitterName);
    var submitterEmail = trim_(p.submitterEmail);

    var splitTrim = function(s) {
      return (s || '').toString().split(',').map(function(x) {
        return x.trim();
      }).filter(String);
    };
    var slugs = splitTrim(p.bandSlugs);
    var names = splitTrim(p.bandNames);

    // New band added inline: create it in the directory and link it.
    var newBandName = trim_(p.newBandName);
    if (newBandName) {
      var newSlug = slugify_(newBandName);
      names.push(newBandName);
      slugs.push(newSlug);

      var existingRow = findIndexRowBySlug_(newSlug);
      if (!existingRow) {
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
      ''
    );

    MailApp.sendEmail(
      NOTIFY_EMAIL,
      '[TCMS] New show added: ' + venue,
      [
        'Show:  ' + (lineup || title),
        'Venue: ' + venue,
        'Date:  ' + date,
        'Notes: ' + (notes || '—'),
        'Link:  ' + (link || '—'),
        '',
        'Submitted by: ' + submitterName + ' <' + submitterEmail + '>',
      ].join('\n')
    );

    return jsonOutput_({ success: true });
  } catch (err) {
    return jsonOutput_({ success: false, error: String(err) });
  }
}

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
    trim_(p.sourceKey)
  );
  return jsonOutput_({ success: true });
}

function upsertShowRow_(fields, sourceKey) {
  var sheet = getShowsSheet_();
  var lastCol = sheet.getLastColumn();
  var headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function(h) {
      return h.toString().trim().toUpperCase();
    });
  var row = headers.map(function(h) {
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

function addBandToIndex_(fields) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INDEX_SHEET_NAME);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return h.toString().trim().toUpperCase();
  });
  var row = headers.map(function(h) {
    return fields[h] != null ? fields[h] : '';
  });
  sheet.appendRow(row);
}

function saveImageToR2_(p) {
  const bytes = Utilities.base64Decode(p.imageBase64);
  const mime = p.imageMimeType || 'image/jpeg';
  const ext = extensionFromMime_(mime);
  const slug = p.bandSlug || 'unknown';
  const key = 'bands/' + slug + '.' + ext;

  const endpoint = 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const url = endpoint + '/' + R2_BUCKET + '/' + key;

  const now = new Date();
  const dateStamp = Utilities.formatDate(now, 'UTC', 'yyyyMMdd');
  const amzDate = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");

  const contentHash = computeSHA256Hex_(bytes);
  const canonicalHeaders =
    'content-type:' + mime + '\n' +
    'host:' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com\n' +
    'x-amz-content-sha256:' + contentHash + '\n' +
    'x-amz-date:' + amzDate + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    '/' + R2_BUCKET + '/' + key,
    '',
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join('\n');

  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    computeSHA256Hex_(Utilities.newBlob(canonicalRequest).getBytes()),
  ].join('\n');

  const signingKey = getSigningKey_(R2_SECRET_ACCESS_KEY, dateStamp, 'auto', 's3');
  const signature = computeHMACSHA256Hex_(signingKey, stringToSign);

  const authorization =
    'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders +
    ', Signature=' + signature;

  const response = UrlFetchApp.fetch(url, {
    method: 'PUT',
    contentType: mime,
    payload: bytes,
    headers: {
      'Authorization': authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': contentHash,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('R2 upload failed: ' + response.getContentText());
  }

  return R2_PUBLIC_URL + '/' + key;
}

function getSigningKey_(secret, dateStamp, region, service) {
  const kDate = computeHMACSHA256Bytes_('AWS4' + secret, dateStamp);
  const kRegion = computeHMACSHA256Bytes_(kDate, region);
  const kService = computeHMACSHA256Bytes_(kRegion, service);
  return computeHMACSHA256Bytes_(kService, 'aws4_request');
}

function computeSHA256Hex_(data) {
  const raw = typeof data === 'string'
    ? Utilities.newBlob(data).getBytes()
    : data;
  return byteArrayToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw));
}

function computeHMACSHA256Hex_(key, message) {
  const msgBytes = Utilities.newBlob(message).getBytes();
  const keyBytes = typeof key === 'string' ? Utilities.newBlob(key).getBytes() : key;
  return byteArrayToHex_(Utilities.computeHmacSha256Signature(msgBytes, keyBytes));
}

function computeHMACSHA256Bytes_(key, message) {
  const msgBytes = Utilities.newBlob(message).getBytes();
  const keyBytes = typeof key === 'string' ? Utilities.newBlob(key).getBytes() : key;
  return Utilities.computeHmacSha256Signature(msgBytes, keyBytes);
}

function byteArrayToHex_(bytes) {
  return bytes.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function writeToIndex_(p, imageUrl, hasNewImage) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INDEX_SHEET_NAME);

  const targetSlug = (p.mode === 'correct' && p.existingSlug) ? p.existingSlug : p.bandSlug;
  const rowNum = findIndexRowBySlug_(targetSlug);
  const col = function(name) { return INDEX_COLUMNS.indexOf(name); };

  if (rowNum) {
    const range = sheet.getRange(rowNum, 1, 1, INDEX_COLUMNS.length);
    const row = range.getValues()[0];
    const oldBandcamp = row[col('BANDCAMP')];
    const oldEmbed = row[col('BANDCAMP_EMBED_URL')];
    const oldEmbedHeight = row[col('BANDCAMP_EMBED_HEIGHT')];
    const embed = bandcampEmbedFor_(p.bandcamp || '', oldBandcamp, oldEmbed, oldEmbedHeight);
    row[col('NAME')] = p.bandName || '';
    row[col('GENRES')] = p.genres || '';
    row[col('LOCATION')] = p.location || '';
    row[col('BIO')] = p.bio || '';
    row[col('STARTED')] = p.started || '';
    row[col('CONTACT_EMAIL')] = p.contactEmail || '';
    row[col('CONTACT_METHOD')] = p.contactMethod || '';
    row[col('WEBSITE')] = p.website || '';
    row[col('INSTAGRAM')] = p.instagram || '';
    row[col('BANDCAMP')] = p.bandcamp || '';
    row[col('BANDCAMP_EMBED_URL')] = embed.embedUrl;
    row[col('BANDCAMP_EMBED_HEIGHT')] = embed.height;
    row[col('SPOTIFY')] = p.spotify || '';
    if (hasNewImage) {
      row[col('IMAGE')] = imageUrl;
    } else if (p.removeImage === 'true') {
      row[col('IMAGE')] = '';
    }
    range.setValues([row]);
    return { action: 'updated', slug: row[col('SLUG')] };
  }

  const newImage = hasNewImage ? imageUrl : '';
  // Resolve once (a new row has no old values to reuse) so we don't fetch twice.
  const newEmbed = bandcampEmbedFor_(p.bandcamp || '', '', '', '');
  const newRow = INDEX_COLUMNS.map(function(name) {
    switch (name) {
      case 'NAME': return p.bandName || '';
      case 'SLUG': return p.bandSlug || '';
      case 'GENRES': return p.genres || '';
      case 'LOCATION': return p.location || '';
      case 'BIO': return p.bio || '';
      case 'STARTED': return p.started || '';
      case 'CONTACT_EMAIL': return p.contactEmail || '';
      case 'CONTACT_METHOD': return p.contactMethod || '';
      case 'IMAGE': return newImage;
      case 'WEBSITE': return p.website || '';
      case 'INSTAGRAM': return p.instagram || '';
      case 'BANDCAMP': return p.bandcamp || '';
      case 'BANDCAMP_EMBED_URL': return newEmbed.embedUrl;
      case 'BANDCAMP_EMBED_HEIGHT': return newEmbed.height;
      case 'SPOTIFY': return p.spotify || '';
      case 'ADDED': return todayString_();
      default: return '';
    }
  });
  sheet.appendRow(newRow);
  return { action: 'created', slug: p.bandSlug || '' };
}

function findIndexRowBySlug_(slug) {
  if (!slug) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INDEX_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const slugCol = INDEX_COLUMNS.indexOf('SLUG') + 1;
  const values = sheet.getRange(2, slugCol, lastRow - 1, 1).getValues();
  const target = String(slug).trim();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === target) return i + 2;
  }
  return null;
}

function sendNotification_(p, imageUrl, result) {
  const photoLine = imageUrl
    ? 'Photo: ' + imageUrl
    : 'Photo: (none — existing photo kept)';

  const body = [
    'This submission has been published live automatically.',
    '',
    'Action: ' + result.action + ' (slug: ' + result.slug + ')',
    'Mode: ' + (p.mode || 'add'),
    'Band: ' + (p.bandName || ''),
    'Genres: ' + (p.genres || ''),
    'Location: ' + (p.location || ''),
    'Started: ' + (p.started || ''),
    'Status: ' + (p.status || ''),
    'Website: ' + (p.website || ''),
    'Instagram: ' + (p.instagram || ''),
    'Bandcamp: ' + (p.bandcamp || ''),
    'Spotify: ' + (p.spotify || ''),
    'Bio: ' + (p.bio || ''),
    photoLine,
    'Submitted by: ' + (p.submitterName || '') + ' <' + (p.submitterEmail || '') + '>',
    'Notes: ' + (p.notes || ''),
  ].join('\n');

  MailApp.sendEmail(
    NOTIFY_EMAIL,
    '[TCMS] Published: ' + (p.bandName || 'unknown'),
    body,
  );
}

function extensionFromMime_(mimeType) {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    default: return 'jpg';
  }
}

function todayString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function doGet() {
  return jsonOutput_({ success: true, status: 'ok', service: 'tcms-submissions' });
}

function doOptions() {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugify_(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function backfillSlugs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INDEX_SHEET_NAME);
  if (!sheet) {
    Logger.log('backfillSlugs_: sheet "%s" not found — aborting.', INDEX_SHEET_NAME);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('backfillSlugs_: no data rows found — nothing to do.');
    return;
  }

  const nameCol = INDEX_COLUMNS.indexOf('NAME') + 1;
  const slugCol = INDEX_COLUMNS.indexOf('SLUG') + 1;
  const numRows = lastRow - 1;

  const names = sheet.getRange(2, nameCol, numRows, 1).getValues();
  const slugRange = sheet.getRange(2, slugCol, numRows, 1);
  const slugs = slugRange.getValues();

  let updated = 0;
  for (let i = 0; i < numRows; i++) {
    const existingSlug = String(slugs[i][0]).trim();
    if (existingSlug) continue;

    const name = String(names[i][0]).trim();
    if (!name) continue;

    const slug = slugify(name);
    if (!slug) {
      Logger.log('Row %s: NAME "%s" produced an empty slug — skipped.', i + 2, name);
      continue;
    }

    slugs[i][0] = slug;
    updated++;
    Logger.log('Row %s: "%s" -> slug "%s"', i + 2, name, slug);
  }

  if (updated > 0) {
    slugRange.setValues(slugs);
  }
  Logger.log('backfillSlugs_: done. %s slug(s) filled in.', updated);
}

function getShowsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Shows');
  if (!sheet) {
    sheet = ss.insertSheet('Shows');
    sheet.appendRow(['SLUG', 'BAND_NAME', 'DATE', 'VENUE', 'TITLE', 'LINEUP', 'BAND_SLUGS', 'NOTES', 'LINK', 'SOURCE', 'SOURCE_KEY', 'ADDED']);
  }
  return sheet;
}

function appendShows_(bandSlug, bandName, showsRaw) {
  if (!showsRaw) return;
  var shows;
  try {
    shows = JSON.parse(showsRaw);
  } catch (e) {
    return;
  }
  if (!Array.isArray(shows) || shows.length === 0) return;
  var sheet = getShowsSheet_();
  var today = todayString_();
  shows.forEach(function(show) {
    if (!show.date && !show.venue) return;
    sheet.appendRow([
      bandSlug || '',
      bandName || '',
      show.date || '',
      show.venue || '',
      '',
      '',
      bandSlug || '',
      show.notes || '',
      show.link || '',
      '',
      '',
      today,
    ]);
  });
}

var SCRAPER_LOG_SHEET_NAME = 'Scraper Log';
var SCRAPER_LOG_HEADERS = [
  'TIMESTAMP', 'SCRAPERS_RUN', 'TOTAL_AUTO_IMPORTED',
  'TOTAL_QUEUED', 'TOTAL_NEW_BANDS', 'NEW_BAND_NAMES', 'RAW_JSON',
];

function getScraperLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SCRAPER_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCRAPER_LOG_SHEET_NAME);
    sheet.appendRow(SCRAPER_LOG_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(SCRAPER_LOG_HEADERS);
  }
  return sheet;
}

function handleScraperLog_(p) {
  var raw = (p.summary || '').toString();
  var summary;
  try {
    summary = JSON.parse(raw);
  } catch (err) {
    getScraperLogSheet_().appendRow([new Date(), 'PARSE_ERROR', '', '', '', '', raw]);
    return jsonOutput_({ success: false, error: 'Could not parse summary' });
  }

  var scrapers = Array.isArray(summary.scrapers) ? summary.scrapers : [];
  var newBandNames = [];
  scrapers.forEach(function(s) {
    (s.newBandsFound || []).forEach(function(name) {
      if (newBandNames.indexOf(name) === -1) newBandNames.push(name);
    });
  });

  var totalImported = summary.totalAutoImported || 0;
  var totalQueued = summary.totalQueued || 0;
  var totalNewBands = summary.totalNewBands || 0;

  getScraperLogSheet_().appendRow([
    summary.ranAt || new Date(),
    scrapers.map(function(s) { return s.name || s.id; }).join(', '),
    totalImported,
    totalQueued,
    totalNewBands,
    newBandNames.join(', '),
    raw,
  ]);

  var lines = [
    'Daily scrape digest — ' + (summary.ranAt || ''),
    '',
    totalImported + ' shows auto-imported',
    totalQueued + ' shows queued for review',
    totalNewBands + ' new band names found',
    '',
    'By venue:',
  ];

  scrapers.forEach(function(s) {
    if (s.error) {
      lines.push('  • ' + (s.name || s.id) + ': ERROR — ' + s.error);
      return;
    }
    lines.push(
      '  • ' + (s.name || s.id) + ': ' +
      (s.total || 0) + ' scraped, ' +
      (s.autoImported || 0) + ' imported, ' +
      (s.queued || 0) + ' queued'
    );
    if ((s.newBandsFound || []).length) {
      lines.push('    new bands: ' + s.newBandsFound.join(', '));
    }
  });

  if (newBandNames.length) {
    lines.push('', 'New bands to add to the directory:');
    newBandNames.forEach(function(name) { lines.push('  - ' + name); });
  }

  MailApp.sendEmail(
    NOTIFY_EMAIL,
    '[TCMS] Daily scrape: ' + totalImported + ' shows imported, ' +
    totalQueued + ' queued, ' + totalNewBands + ' new bands',
    lines.join('\n')
  );

  return jsonOutput_({ success: true });
}

var NON_LOCAL_SHEET_NAME = 'Non-Local Bands';
var NON_LOCAL_HEADERS = ['TIMESTAMP', 'NAME', 'SLUG'];

function getNonLocalSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NON_LOCAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NON_LOCAL_SHEET_NAME);
    sheet.appendRow(NON_LOCAL_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(NON_LOCAL_HEADERS);
  }
  return sheet;
}

function handleNonLocalBand_(p) {
  var name = (p.bandName || '').toString().trim();
  var slug = (p.bandSlug || '').toString().trim();
  getNonLocalSheet_().appendRow([new Date(), name, slug]);
  return jsonOutput_({ success: true });
}

/* ── Bandcamp embed resolution ───────────────────────────────────────────────
 *
 * Turns the raw Bandcamp URL a submitter provides (the BANDCAMP column) into a
 * compact EmbeddedPlayer URL, written to a "Bandcamp Embed URL" column on the
 * Index tab. Mirrors lib/bandcamp.ts in the Next.js app — keep the regex, the
 * item_type normalization, and the embed URL shape in sync across both.
 *
 * These are pure helpers only. Wiring them into writeToIndex_ / INDEX_COLUMNS
 * (so submissions and corrections actually populate the embed column) is the
 * next step and is intentionally not done here.
 */

function isBandcampUrl_(url) {
  return /^https?:\/\/([a-z0-9-]+\.)?bandcamp\.com\//i.test(trim_(url));
}

/**
 * Decode the HTML entities Bandcamp emits inside the meta tag's content="..."
 * attribute (the JSON's own quotes are &quot;). Numeric entities handled too.
 */
function decodeHtmlEntities_(input) {
  return input
    .replace(/&#x([0-9a-f]+);/gi, function (_, hex) {
      return String.fromCodePoint(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function (_, dec) {
      return String.fromCodePoint(parseInt(dec, 10));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last, so decoded entities aren't re-decoded
}

/** Normalize item_type to 'album' | 'track' (Bandcamp uses full words or a/t). */
function normalizeBandcampType_(raw) {
  var t = (raw == null ? '' : raw).toString().toLowerCase();
  if (t === 'album' || t === 'a') return 'album';
  if (t === 'track' || t === 't') return 'track';
  return '';
}

/**
 * Extract { itemType, itemId } from a Bandcamp page's HTML via its
 * <meta name="bc-page-properties"> tag. Returns null if missing/unparseable.
 */
function parseBandcampMeta_(html) {
  var tagMatch = html.match(/<meta[^>]*\bbc-page-properties\b[^>]*>/i);
  if (!tagMatch) return null;
  var contentMatch = tagMatch[0].match(/content=(["'])([\s\S]*?)\1/i);
  if (!contentMatch) return null;

  var props;
  try {
    props = JSON.parse(decodeHtmlEntities_(contentMatch[2]));
  } catch (err) {
    return null;
  }
  if (!props || typeof props !== 'object') return null;

  var itemType = normalizeBandcampType_(props.item_type);
  if (!itemType) return null;
  if (props.item_id == null || props.item_id === '') return null;

  return { itemType: itemType, itemId: props.item_id.toString() };
}

/**
 * Build the compact EmbeddedPlayer URL — the proven minimal single-line bar
 * (artwork=none), used as the fallback for plain Bandcamp URLs.
 */
function buildBandcampEmbedUrl_(item) {
  return (
    'https://bandcamp.com/EmbeddedPlayer/' +
    item.itemType +
    '=' +
    item.itemId +
    '/size=small/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=none/transparent=true/'
  );
}

/** The minimal bar's known, confirmed-responsive height. */
var MINIMAL_BAR_HEIGHT_ = 40;

/**
 * Parse a Bandcamp <iframe> embed snippet (from their Share/Embed button) into
 * { embedUrl, height }, used verbatim. Returns null if it isn't an iframe, its
 * src isn't a bandcamp.com EmbeddedPlayer URL (rejected — user-submitted input
 * on a public form), or no height can be found.
 */
function parseBandcampEmbedSnippet_(input) {
  if (!/<iframe/i.test(input)) return null;

  var srcMatch = input.match(/\bsrc=(["'])([\s\S]*?)\1/i);
  var src = srcMatch ? trim_(srcMatch[2]) : '';
  if (!src || !/^https:\/\/bandcamp\.com\/EmbeddedPlayer\//i.test(src)) {
    return null;
  }

  var height = 0;
  var attr = input.match(/\bheight=(["'])\s*(\d+)(?:px)?\s*\1/i);
  if (attr) height = parseInt(attr[2], 10);
  if (!height) {
    var style = input.match(/height\s*:\s*(\d+)\s*px/i);
    if (style) height = parseInt(style[1], 10);
  }
  if (!height || isNaN(height)) return null;

  return { embedUrl: src, height: height };
}

/**
 * Resolve raw Bandcamp input to { embedUrl, height }. Hybrid behaviour: a pasted
 * <iframe> embed snippet is used verbatim (exact src + height); otherwise the
 * input is treated as a plain URL, scraped, and rendered as the minimal bar at
 * its fixed height. Returns { embedUrl: '', height: 0 } on any failure so a
 * blank embed never fails the surrounding submission.
 */
function resolveBandcampEmbedUrl_(rawInput) {
  var input = trim_(rawInput);

  if (input.indexOf('<iframe') !== -1) {
    var snippet = parseBandcampEmbedSnippet_(input);
    return snippet ? snippet : { embedUrl: '', height: 0 };
  }

  if (!isBandcampUrl_(input)) return { embedUrl: '', height: 0 };
  try {
    var res = UrlFetchApp.fetch(input, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
    if (res.getResponseCode() !== 200) return { embedUrl: '', height: 0 };
    var item = parseBandcampMeta_(res.getContentText());
    return item
      ? { embedUrl: buildBandcampEmbedUrl_(item), height: MINIMAL_BAR_HEIGHT_ }
      : { embedUrl: '', height: 0 };
  } catch (err) {
    return { embedUrl: '', height: 0 };
  }
}

/**
 * Decide the "Bandcamp Embed URL" value for a submission/correction, re-resolving
 * only when the raw URL is new or has changed — so unrelated edits to a band row
 * don't trigger a network fetch.
 *
 * @param {string} newUrl      Bandcamp field from the submission (URL or iframe; may be '').
 * @param {string} oldUrl      Bandcamp field currently stored (correction only).
 * @param {string} oldEmbed    Embed URL currently stored (correction only).
 * @param {string|number} oldHeight  Embed height currently stored (correction only).
 * @return {{embedUrl: string, height: number}} Values to write (blank clears them).
 */
function bandcampEmbedFor_(newUrl, oldUrl, oldEmbed, oldHeight) {
  newUrl = trim_(newUrl);
  oldUrl = trim_(oldUrl);
  oldEmbed = trim_(oldEmbed);
  if (!newUrl) return { embedUrl: '', height: 0 }; // cleared → clear both.
  if (newUrl === oldUrl && oldEmbed) {
    // Unchanged raw field → reuse the stored embed (and its height).
    var h = parseInt(oldHeight, 10);
    return { embedUrl: oldEmbed, height: (h && !isNaN(h)) ? h : MINIMAL_BAR_HEIGHT_ };
  }
  return resolveBandcampEmbedUrl_(newUrl);
}