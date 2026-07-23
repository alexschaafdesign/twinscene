// RSVPs for Song Club events. The public form (app/api/song-club/rsvp) inserts
// here and fires a confirmation email; the admin roster reads back the list +
// totals. Mirrors Birdhaus's lib/rsvps.ts.

import { sql } from "./db.ts";

export interface SongClubRsvp {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  confirmation_email_sent_at: string | null;
  created_at: string;
}

export interface SongClubRsvpSummary {
  rsvps: SongClubRsvp[];
  totalCount: number;
  totalGuests: number;
}

const COLUMNS = sql`
  id, event_id, name, email, guests, confirmation_email_sent_at, created_at
`;

export async function createRsvp(input: {
  eventId: number;
  name: string;
  email: string;
  guests: number;
}): Promise<SongClubRsvp> {
  const [row] = await sql<SongClubRsvp[]>`
    insert into song_club_rsvps (event_id, name, email, guests)
    values (${input.eventId}, ${input.name}, ${input.email}, ${input.guests})
    returning ${COLUMNS}
  `;
  return row;
}

export async function markConfirmationSent(id: number): Promise<void> {
  await sql`update song_club_rsvps set confirmation_email_sent_at = now() where id = ${id}`;
}

export async function getRsvpsForEvent(eventId: number): Promise<SongClubRsvpSummary> {
  const rsvps = await sql<SongClubRsvp[]>`
    select ${COLUMNS} from song_club_rsvps
    where event_id = ${eventId}
    order by created_at desc
  `;
  const totalGuests = rsvps.reduce((sum, r) => sum + r.guests, 0);
  return { rsvps, totalCount: rsvps.length, totalGuests };
}

export async function deleteRsvp(id: number): Promise<boolean> {
  const result = await sql`delete from song_club_rsvps where id = ${id}`;
  return result.count > 0;
}
