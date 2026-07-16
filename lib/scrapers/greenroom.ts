// Scraper for Green Room's events page.
//
// https://www.greenroommn.com/events is a Squarespace page embedding a
// VenuePilot widget (`<script src="https://www.venuepilot.co/widgets/<id>.js">`)
// rather than any HTML event markup. That widget script inlines a
// `window.venuepilotSettings` config (JSON) carrying the venue's VenuePilot
// account id, then loads the actual widget bundle from a separate CDN. Reading
// the account id off the page — rather than hardcoding it — means this keeps
// working if the venue swaps widgets (mirrors zhora.ts's Dice config read).
//
// The widget bundle itself calls VenuePilot's public GraphQL API
// (POST https://www.venuepilot.co/graphql, query `publicEvents`) to load the
// events grid. That API is far richer than anything on the rendered page: it
// returns each show's artist lineup as a structured array rather than a title
// to parse, so there's no band-name-splitting heuristics needed for ordinary
// shows. Some listings — open mics, private parties, DJ/dance nights — come
// back with an empty `announceArtists` array (confirmed live: e.g. "REVENTON"
// and "Rainforest RAVE" carry no structured lineup at all, even though the
// venue's own event description sometimes names the DJs in prose). Those are
// kept rather than dropped, labeled with an event-type tag derived from the
// event's `name` field, mirroring hookandladder.ts/acadia.ts.
//
// No ticket price is exposed by this query (the widget's own grid doesn't
// display one either — it defers to the ticketsUrl), so advancePrice/dosPrice
// are always null here.

import type { ScrapedShow } from "./types";

const VENUE = "Green Room";
const EVENTS_URL = "https://www.greenroommn.com/events";
const GRAPHQL_URL = "https://www.venuepilot.co/graphql";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

const PUBLIC_EVENTS_QUERY = `
  query ($accountIds: [Int!]!, $startDate: String!) {
    publicEvents(accountIds: $accountIds, startDate: $startDate) {
      id
      name
      date
      doorTime
      startTime
      ticketsUrl
      announceArtists {
        name
      }
      announceImages {
        highlighted
        versions {
          cover {
            src
          }
        }
      }
    }
  }
`;

// Event-type labels for listings that arrive with no structured lineup,
// matched against the event name in order (first hit wins). Anything
// unrecognized falls back to a generic "Event" so it's still visibly flagged
// as a non-show — mirrors hookandladder.ts's classifyEventType, which always
// returns a label rather than null: this only runs once we already know
// there's no lineup, so there's no "is this even a non-show?" call to make,
// just "what kind."
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/open mic/i, "Open Mic"],
  [/\btribute\b/i, "Tribute Night"],
  [/\brave\b|\bclub night\b|\bthrowback\b/i, "DJ Night"],
];

function classifyEventType(name: string): string {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(name)) return label;
  }
  return "Event";
}

type PublicEvent = {
  id: number;
  name: string;
  date: string; // "YYYY-MM-DD"
  doorTime: string | null; // "HH:MM:SS", venue-local
  startTime: string | null;
  ticketsUrl: string | null;
  announceArtists: { name: string }[];
  announceImages: { highlighted: boolean; versions: { cover: { src: string } | null } }[];
};

/** Pull the venuepilot.co widget script URL off the events page. */
function extractWidgetScriptUrl(html: string): string {
  const m = html.match(
    /https:\/\/www\.venuepilot\.co\/widgets\/[a-zA-Z0-9]+\.js/,
  );
  if (!m) {
    throw new Error("Green Room: VenuePilot widget script not found on the events page");
  }
  return m[0];
}

/** Pull the VenuePilot account id out of the widget script's inline config. */
function extractAccountId(widgetScript: string): number {
  const m = widgetScript.match(
    /window\.venuepilotSettings\s*=\s*(\{[\s\S]*?\});/,
  );
  if (!m) {
    throw new Error("Green Room: venuepilotSettings config not found in widget script");
  }
  let settings: { general?: { accountIds?: unknown } };
  try {
    settings = JSON.parse(m[1]);
  } catch {
    throw new Error("Green Room: could not parse venuepilotSettings config");
  }
  const accountId = settings.general?.accountIds;
  if (!Array.isArray(accountId) || typeof accountId[0] !== "number") {
    throw new Error("Green Room: venuepilotSettings config is missing accountIds");
  }
  return accountId[0];
}

/** "HH:MM:SS" (venue-local) -> "7:00pm", matching the other scrapers' format. */
function formatTime(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 24;
  const minute = m[2];
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${suffix}`;
}

async function fetchAccountId(): Promise<number> {
  const pageRes = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(
      `Green Room events page failed (${pageRes.status} ${pageRes.statusText})`,
    );
  }
  const widgetUrl = extractWidgetScriptUrl(await pageRes.text());

  const widgetRes = await fetch(widgetUrl, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!widgetRes.ok) {
    throw new Error(
      `Green Room widget script failed (${widgetRes.status} ${widgetRes.statusText})`,
    );
  }
  return extractAccountId(await widgetRes.text());
}

function parseEvent(event: PublicEvent): ScrapedShow | null {
  const announced = event.announceArtists.map((a) => a.name).filter(Boolean);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  let tag: string | null;
  if (announced.length > 0) {
    [headliner, ...supporting] = announced;
    allBands = announced;
    tag = null;
  } else {
    // No structured lineup — open mic, private event, DJ/dance night, etc.
    // Keep it, but label what kind of event it is (mirrors hookandladder.ts).
    const name = event.name?.trim();
    if (!name) return null; // nothing to show
    headliner = name;
    supporting = [];
    allBands = [];
    tag = classifyEventType(name);
  }

  const flyer =
    event.announceImages.find((img) => img.highlighted) ?? event.announceImages[0];

  return {
    venue: VENUE,
    date: event.date,
    headliner,
    supporting,
    allBands,
    flyerUrl: flyer?.versions.cover?.src ?? null,
    ticketUrl: event.ticketsUrl,
    doorsTime: formatTime(event.doorTime),
    musicTime: formatTime(event.startTime),
    advancePrice: null,
    dosPrice: null,
    sourceUrl: `${EVENTS_URL}#/events/${event.id}`,
    tag,
  };
}

export async function scrapeGreenRoom(): Promise<ScrapedShow[]> {
  const accountId = await fetchAccountId();

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      query: PUBLIC_EVENTS_QUERY,
      variables: { accountIds: [accountId], startDate: today },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Green Room GraphQL request failed (${res.status} ${res.statusText})`);
  }
  const json: { data?: { publicEvents: PublicEvent[] }; errors?: unknown } = await res.json();
  if (!json.data) {
    throw new Error(`Green Room GraphQL request returned errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.publicEvents.map(parseEvent).filter((s): s is ScrapedShow => s !== null);
}
