// Song Club events — admin-run songwriter meetups with a public RSVP form.
// Its own table (migration 0067), independent of the scraped `shows` table:
// these are our own events, like Birdhaus house shows. Raw-SQL data layer,
// following the lib/articles.ts conventions.

import { sql } from "./db.ts";

// Mirrors the `song_club_events` columns (snake_case).
export interface SongClubEvent {
  id: number;
  slug: string;
  title: string;
  event_date: string; // "YYYY-MM-DD"
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  address: string | null;
  arrival_notes: string | null;
  description: string | null;
  flyer_url: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

// The shape the admin form posts / the API layer accepts. Slug is derived, not
// supplied.
export interface SongClubEventInput {
  title: string;
  eventDate: string; // "YYYY-MM-DD"
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  address: string | null;
  arrivalNotes: string | null;
  description: string | null;
  flyerUrl: string | null;
  published: boolean;
}

const COLUMNS = sql`
  id, slug, title, event_date::text as event_date, start_time, end_time,
  venue_name, address, arrival_notes, description, flyer_url, published,
  created_at, updated_at
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The raw JSON body the admin form posts.
export interface SongClubEventBody {
  title?: unknown;
  eventDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  venueName?: unknown;
  address?: unknown;
  arrivalNotes?: unknown;
  description?: unknown;
  flyerUrl?: unknown;
  published?: unknown;
}

function optionalTrim(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Validates + normalizes a posted body into a SongClubEventInput, or returns an
// { error } the route turns into a 400. Shared by the create + update routes so
// the two enforce identical rules.
export function buildEventInput(
  body: SongClubEventBody
): SongClubEventInput | { error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "Title is required" };

  const eventDate = typeof body.eventDate === "string" ? body.eventDate.trim() : "";
  if (!ISO_DATE_RE.test(eventDate)) return { error: "A valid event date is required" };

  return {
    title,
    eventDate,
    startTime: optionalTrim(body.startTime),
    endTime: optionalTrim(body.endTime),
    venueName: optionalTrim(body.venueName),
    address: optionalTrim(body.address),
    arrivalNotes: optionalTrim(body.arrivalNotes),
    description: optionalTrim(body.description),
    flyerUrl: optionalTrim(body.flyerUrl),
    published: body.published === true,
  };
}

// Derives a URL slug from an event's date and title, e.g. "2026-08-15" +
// "August Songwriter Circle" -> "2026-08-15-august-songwriter-circle". Mirrors
// Birdhaus's show slug convention.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Today in Central Time as "YYYY-MM-DD". event_date is stored the same way, so
// the two compare lexicographically: upcoming while event_date >= today.
export function getTodayCentral(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// All events, newest first. `publishedOnly` gates out drafts for public callers.
export async function listEvents(
  { publishedOnly = false }: { publishedOnly?: boolean } = {}
): Promise<SongClubEvent[]> {
  return sql<SongClubEvent[]>`
    select ${COLUMNS}
    from song_club_events
    ${publishedOnly ? sql`where published = true` : sql``}
    order by event_date desc, created_at desc
  `;
}

export async function getEventBySlug(slug: string): Promise<SongClubEvent | null> {
  const [row] = await sql<SongClubEvent[]>`
    select ${COLUMNS} from song_club_events where slug = ${slug} limit 1
  `;
  return row ?? null;
}

export async function getEventById(id: number): Promise<SongClubEvent | null> {
  const [row] = await sql<SongClubEvent[]>`
    select ${COLUMNS} from song_club_events where id = ${id} limit 1
  `;
  return row ?? null;
}

// Builds a slug that's unique across events. If the base (date-title) is taken
// by a DIFFERENT event, appends -2, -3, … The excludeId lets an edit keep its
// own slug without colliding with itself.
async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  const taken = await sql<{ slug: string }[]>`
    select slug from song_club_events
    where slug like ${base + "%"} ${excludeId ? sql`and id <> ${excludeId}` : sql``}
  `;
  const set = new Set(taken.map((r) => r.slug));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

export async function createEvent(input: SongClubEventInput): Promise<SongClubEvent> {
  const slug = await uniqueSlug(slugify(`${input.eventDate}-${input.title}`));
  const [row] = await sql<SongClubEvent[]>`
    insert into song_club_events
      (slug, title, event_date, start_time, end_time, venue_name, address,
       arrival_notes, description, flyer_url, published)
    values
      (${slug}, ${input.title}, ${input.eventDate}, ${input.startTime},
       ${input.endTime}, ${input.venueName}, ${input.address},
       ${input.arrivalNotes}, ${input.description}, ${input.flyerUrl},
       ${input.published})
    returning ${COLUMNS}
  `;
  return row;
}

export async function updateEvent(
  id: number,
  input: SongClubEventInput
): Promise<SongClubEvent | null> {
  const slug = await uniqueSlug(slugify(`${input.eventDate}-${input.title}`), id);
  const [row] = await sql<SongClubEvent[]>`
    update song_club_events set
      slug = ${slug},
      title = ${input.title},
      event_date = ${input.eventDate},
      start_time = ${input.startTime},
      end_time = ${input.endTime},
      venue_name = ${input.venueName},
      address = ${input.address},
      arrival_notes = ${input.arrivalNotes},
      description = ${input.description},
      flyer_url = ${input.flyerUrl},
      published = ${input.published},
      updated_at = now()
    where id = ${id}
    returning ${COLUMNS}
  `;
  return row ?? null;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const result = await sql`delete from song_club_events where id = ${id}`;
  return result.count > 0;
}
