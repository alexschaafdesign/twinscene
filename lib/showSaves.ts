// Slice 2 of Phase 3 (user collections): show attendance tracking. status is
// one of 'interested' | 'going' | 'went' — see migration 0018 for the schema.
// Note show_saves.show_id is uuid (shows.id uses gen_random_uuid()), unlike
// saved_bands/band_follows' bigint band_id.

import { sql } from "./db.ts";
import { todayInChicago } from "./fetchShows.ts";

export type ShowStatus = "interested" | "going" | "went";

const VALID_STATUSES: readonly ShowStatus[] = ["interested", "going", "went"];

export function isValidShowStatus(value: unknown): value is ShowStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

// Upsert — re-setting the same status is a no-op (still one row, status
// overwritten with the same value); changing status updates the existing row
// rather than creating a duplicate.
export async function setShowStatus(userId: number, showId: string, status: ShowStatus): Promise<void> {
  await sql`
    insert into show_saves (user_id, show_id, status)
    values (${userId}, ${showId}, ${status})
    on conflict (user_id, show_id) do update set status = excluded.status
  `;
}

// Clearing a status that isn't set is a no-op, not an error.
export async function clearShowStatus(userId: number, showId: string): Promise<void> {
  await sql`
    delete from show_saves where user_id = ${userId} and show_id = ${showId}
  `;
}

export async function getShowStatus(userId: number, showId: string): Promise<ShowStatus | null> {
  const [row] = await sql<{ status: ShowStatus }[]>`
    select status from show_saves where user_id = ${userId} and show_id = ${showId} limit 1
  `;
  return row?.status ?? null;
}

// Bulk lookup so a rendered list of shows (ShowsTimeline) can annotate every
// card with the current user's status in one query instead of N.
export async function listShowStatuses(
  userId: number,
  showIds: string[],
): Promise<Record<string, ShowStatus>> {
  if (showIds.length === 0) return {};
  const rows = await sql<{ show_id: string; status: ShowStatus }[]>`
    select show_id, status from show_saves
    where user_id = ${userId} and show_id in ${sql(showIds)}
  `;
  return Object.fromEntries(rows.map((r) => [r.show_id, r.status]));
}

export interface UpcomingShowStatus {
  show_id: string;
  status: ShowStatus;
  date: string;
  venue_name: string;
  title: string;
  lineup: string; // comma-joined lineup names — the bands-forward heading (see lib/showDisplay.ts)
}

// Shows the user marked interested/going that haven't happened yet, soonest
// first, for the "Shows you're going to" profile section.
export async function listUpcomingForUser(userId: number): Promise<UpcomingShowStatus[]> {
  const today = todayInChicago();
  return sql<UpcomingShowStatus[]>`
    select
      shows.id as show_id,
      show_saves.status,
      to_char(shows.date, 'YYYY-MM-DD') as date,
      shows.venue_name,
      shows.title,
      coalesce(
        (select string_agg(e->>'name', ', ')
           from jsonb_array_elements(coalesce(shows.lineup, '[]'::jsonb)) as e),
        ''
      ) as lineup
    from show_saves
    join shows on shows.id = show_saves.show_id
    where show_saves.user_id = ${userId}
      and show_saves.status in ('interested', 'going')
      and shows.date >= ${today}
    order by shows.date asc
  `;
}

export interface AttendedShow {
  show_id: string;
  date: string;
  venue_name: string;
  title: string;
  lineup: string; // comma-joined lineup names — the bands-forward heading (see lib/showDisplay.ts)
}

// Shows marked 'went', most recent first, for the "Shows you've been to"
// profile section. Not date-filtered — a past 'went' show stays 'went'
// regardless of when it was marked.
export async function listAttended(userId: number): Promise<AttendedShow[]> {
  return sql<AttendedShow[]>`
    select
      shows.id as show_id,
      to_char(shows.date, 'YYYY-MM-DD') as date,
      shows.venue_name,
      shows.title,
      coalesce(
        (select string_agg(e->>'name', ', ')
           from jsonb_array_elements(coalesce(shows.lineup, '[]'::jsonb)) as e),
        ''
      ) as lineup
    from show_saves
    join shows on shows.id = show_saves.show_id
    where show_saves.user_id = ${userId} and show_saves.status = 'went'
    order by shows.date desc
  `;
}

export interface AttendedStats {
  total: number;
  thisYear: number;
}

// All-time and this-calendar-year (America/Chicago) counts of 'went' shows,
// for the public profile's stats row — thisYear is the number a future
// leaderboard will rank on.
export async function getAttendedStats(userId: number): Promise<AttendedStats> {
  const year = Number(todayInChicago().slice(0, 4));
  const [row] = await sql<{ total: string; this_year: string }[]>`
    select
      count(*) as total,
      count(*) filter (where extract(year from shows.date) = ${year}) as this_year
    from show_saves
    join shows on shows.id = show_saves.show_id
    where show_saves.user_id = ${userId} and show_saves.status = 'went'
  `;
  return { total: Number(row.total), thisYear: Number(row.this_year) };
}
