// Scraper for Eagles #34 (Fraternal Order of Eagles Aerie 34, Minneapolis).
//
// Unlike every other venue in this repo, Eagles 34 isn't a dedicated music
// venue with its own booking calendar — it's a fraternal-lodge hall, and its
// public Google Calendar (embedded at
// calendar.google.com/calendar/u/0/newembed?src=aerie34trustee@gmail.com) is
// the whole building's shared booking sheet. Real band shows sit in the same
// feed as: lodge business (Trustee/Aerie/Auxiliary meetings), recreational
// leagues (darts, bingo, trivia), civic-group meetings that rent the hall
// (Minneapolis Retired Teachers Association, American Legion Post 1), hall
// rentals, and private life events (funerals, weddings, celebrations of
// life). Those categories are dropped outright in NON_MUSIC_RE below — there
// tends to be no real ambiguity about them not being a public music show.
//
// Two more house calls (confirmed with the site owner, since no keyword list
// can get these perfectly right on its own):
//   - Social dance nights that book a real band (square/contra/salsa/swing/
//     Cajun/Latin dances, dance lessons) are skipped entirely — the dance is
//     the draw, not the band, so these aren't treated as shows here.
//   - Karaoke nights are kept but tagged (not treated as a band), mirroring
//     hookandladder.ts/amsterdam.ts's non-band event-type tag.
// Everything else passes through as a show, even titles that read like a
// private party ("Egg Nog Ball", "SCCA Frolic") — there's no reliable keyword
// to separate those from a real booked band, and the house preference is to
// risk a little noise over silently dropping a real show.
//
// Data comes straight from the calendar's public ICS export (no separate
// widget/page to scrape), parsed with node-ical exactly like flyingv.ts's
// Google Calendar feed: `ical.expandRecurringEvent` resolves RRULE/
// RECURRENCE-ID recurring bookings (the weekly Bingo/Karaoke/meetings, and
// the rotating-guest "Miss Shannon presents <band>" residency) into concrete
// instances. This is a hand-maintained calendar with decades of history and
// the usual mess that implies: manual "CANCELLED"/"Cancelled" markers baked
// into titles rather than the ICS STATUS field (which stays CONFIRMED), some
// multi-band bills separated by newlines instead of commas, and the
// recurring "Miss Shannon presents X" / "Miss Shannon - X" residency needing
// its promoter prefix stripped so "Miss Shannon" doesn't get scraped in as a
// fake headliner.
//
// A cover charge occasionally appears in the description ("Cover: $10") on
// older entries but is essentially never filled in for upcoming ones — best-
// effort extraction only; expect null most of the time. Doors/set times
// aren't posted in a consistently parseable form at all, so those are always
// null. No flyer images or ticket links exist for this venue; a ticketUrl is
// only ever set if a description happens to embed one.

import ical from "node-ical";
import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "Eagles 34";
const EVENTS_URL =
  "https://calendar.google.com/calendar/u/0/newembed?src=aerie34trustee@gmail.com&ctz=America/Chicago";
const TIMEZONE = "America/Chicago";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// The calendar's own public ICS export — the real data source (see file header).
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/aerie34trustee%40gmail.com/public/basic.ics";

// How far ahead to pull. This calendar books some annual events (Oktoberfest,
// an Egg Nog Ball) well over 6 months out, so this reaches further than
// flyingv.ts's 180-day window.
const WINDOW_DAYS = 270;

// A bare "CLOSED ..." marker (e.g. "CLOSED MONDAYS except for Private
// Parties") — the hall blocking off a recurring slot, not an event. Dropped
// outright, mirroring flyingv.ts's/acadia.ts's CLOSED_RE.
const CLOSED_RE = /^closed\b/i;

// Cancellations are a manual title convention here ("Cancelled Mechanix",
// "Rogue Tango(Cancelled)", "CANCELLED-Salsa Dancing") — the ICS STATUS field
// stays CONFIRMED/TENTATIVE regardless, so this is the only signal. Unlike
// flyingv.ts's leading-anchor CANCELED_RE, this calendar's "cancel" shows up
// anywhere in the title (leading, trailing, mid-string, inside parens), so
// match it unanchored.
const CANCELED_RE = /cancel/i;

// Lodge business, leagues, civic-group meetings, rentals, and private life
// events sharing the same calendar as real shows — see file header. Kept as
// a flat list of independent signals (not a single combined regex) so it's
// easy to add one more line when a new non-music category turns up.
const NON_MUSIC_RE = [
  /\bmeetings?\b|\bmtg\b/i,
  /\btrustees?\b/i,
  /\baerie\b/i,
  /\bauxiliary\b/i,
  /\bton up\b/i,
  /\bleagues?\b/i,
  /\bdarts?\b/i,
  /\btrivia\b/i,
  /\bbingo\b/i,
  /\bassociations?\b/i,
  /\bco-?op\b/i,
  /\brentals?\b/i,
  /\bfuneral\b/i,
  /\bmemorial\b/i,
  /\bwake\b/i,
  /celeb(?:ration)?\.?\s*of\s*life|life celebration/i,
  /\bwedding\b/i,
  /\bshower\b/i,
  /\breunion\b/i,
  /\bgraduation\b/i,
  /\bretirement\b/i,
  /\bblood drive\b/i,
  /\brotc\b/i,
  /\blunch\b/i,
  /\bbreakfast\b/i,
  /\bdinner\b/i,
  /retired teachers/i,
  /\bpost\s*#?\s*1\b/i,
  /fifth district|5th district/i,
];

function isNonMusicAdmin(title: string): boolean {
  return NON_MUSIC_RE.some((re) => re.test(title));
}

// Social dance nights book a real band, but the house call is to skip these
// entirely rather than list them as shows (see file header).
const DANCE_RE = /\bdanc(?:e|ing|ers?)\b/i;

// Karaoke nights are kept, just not treated as a band (tag field, like
// hookandladder.ts).
const KARAOKE_RE = /\bkaraoke\b/i;

// The venue's dominant recurring promoter/host residency: "Miss Shannon
// presents <band>", "Miss Shannon - <band>", "Miss Shannon- <band>", or just
// "Miss Shannon <band>". Stripped so "Miss Shannon" isn't scraped in as a
// fake headliner ahead of the real guest act.
const PROMOTER_PREFIX_RE = /^miss shannon(?:'s)?\s*(?:presents\s+|[-–—]\s*)?/i;

// "World Music Monday hosted by Other Country Ensemble" — the house series
// name comes first, the actual performing act after "hosted by".
const HOSTED_BY_RE = /^.*?\s+hosted by\s+(.+)$/i;

/** Split a bill string into individual act names. Mirrors flyingv.ts's
 * splitBands, plus a newline split — some multi-band bills here are entered
 * one act per line rather than comma-separated — and a guard on "&"/"and":
 * this venue's country/swing residencies are full of singer-plus-backing-band
 * names ("Steve Clarke and the Working Stiffs", "Tim Patrick & His Blue Eyes
 * Band") where "and"/"&" is part of one act's own name, not a join between two
 * acts — so it's only treated as a separator when NOT immediately followed by
 * "the"/"his"/"her"/"a"/"an", the words that mark a backing-band name rather
 * than a second act. */
function splitBands(raw: string): string[] {
  const { text: protectedText, restore } = protectKnownNames(raw.trim());
  const names = protectedText
    .split(/\n+/)
    .flatMap((line) =>
      line.split(
        /\s+w\/\s*|\s+with\s+|\s*\/\/\s*|\s*\/\s*|(?:\s+&\s+|\s+and\s+)(?!(?:the|his|her|an?)\s)|\s*,\s*|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+feat\.\s+|\s+ft\.\s+/i,
      ),
    );
  return names
    .map(restore)
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n) && !/^(?:and\s+)?more!?$/i.test(n));
}

const URL_RE = /https?:\/\/\S+/;
const COVER_RE = /\bcover\b\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i;

/** "Cover: $10" -> 10. null when absent — essentially always, for upcoming
 * events (see file header). */
function parseCover(description: string | null): number | null {
  if (!description) return null;
  const m = COVER_RE.exec(description);
  return m ? parseFloat(m[1]) : null;
}

/** node-ical returns ICS text fields as plain strings, except when the source
 * line carries parameters, in which case it's `{val, params}` — handle both. */
function textValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val);
  return "";
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parseInstance(instance: ical.EventInstance): ScrapedShow | null {
  const rawTitle = textValue(instance.event.summary).trim();
  if (!rawTitle || CLOSED_RE.test(rawTitle) || CANCELED_RE.test(rawTitle)) return null;
  if (isNonMusicAdmin(rawTitle) || DANCE_RE.test(rawTitle)) return null;

  const date = localDate(instance.start);
  const description = textValue(instance.event.description).trim() || null;
  const ticketUrl = description ? URL_RE.exec(description)?.[0] ?? null : null;
  const advancePrice = parseCover(description);

  if (KARAOKE_RE.test(rawTitle)) {
    return {
      venue: VENUE,
      date,
      headliner: rawTitle,
      supporting: [],
      allBands: [],
      flyerUrl: null,
      ticketUrl,
      doorsTime: null,
      musicTime: null,
      advancePrice,
      dosPrice: null,
      sourceUrl: EVENTS_URL,
      tag: "Karaoke",
    };
  }

  const hostedBy = HOSTED_BY_RE.exec(rawTitle);
  const titleForBands = hostedBy ? hostedBy[1] : rawTitle.replace(PROMOTER_PREFIX_RE, "");

  const allBands = splitBands(titleForBands);
  if (allBands.length === 0) return null;
  const [headliner, ...supporting] = allBands;

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: null,
    ticketUrl,
    doorsTime: null,
    musicTime: null,
    advancePrice,
    dosPrice: null,
    sourceUrl: EVENTS_URL,
  };
}

export async function scrapeEagles34(): Promise<ScrapedShow[]> {
  const res = await fetch(ICAL_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Eagles 34 calendar feed request failed (${res.status} ${res.statusText})`);
  }

  const events = ical.parseICS(await res.text());
  const now = new Date();
  const future = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const instances = Object.values(events)
    .filter((e): e is ical.VEvent => e != null && e.type === "VEVENT")
    .flatMap((event) => ical.expandRecurringEvent(event, { from: now, to: future }));

  return instances.map(parseInstance).filter((s): s is ScrapedShow => s !== null);
}
