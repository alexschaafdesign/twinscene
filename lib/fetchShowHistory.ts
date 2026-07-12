// Read side for the show write audit trail (lib/shows.ts writes show_history
// rows in the same transaction as every shows write). Powers the admin
// "Recent Activity" view — never surfaced publicly.

import { sql } from "@/lib/db";

export type ShowHistoryEntry = {
  id: string;
  showId: string;
  action: string;
  actor: string;
  changedFields: Record<string, unknown> | null;
  submitterName: string;
  submitterEmail: string;
  createdAt: string; // ISO timestamp
  show: { title: string; venue: string; date: string };
};

const WINDOW_DAYS = 30;
const ROW_LIMIT = 200;

export async function fetchShowHistory(): Promise<ShowHistoryEntry[]> {
  const rows = await sql`
    SELECT
      h.id, h.show_id, h.action, h.actor, h.changed_fields,
      h.submitter_name, h.submitter_email, h.created_at,
      s.title, s.venue_name, to_char(s.date, 'YYYY-MM-DD') AS show_date
    FROM show_history h
    JOIN shows s ON s.id = h.show_id
    WHERE h.created_at >= now() - make_interval(days => ${WINDOW_DAYS})
    ORDER BY h.created_at DESC
    LIMIT ${ROW_LIMIT}
  `;

  return rows.map((row) => ({
    id: row.id,
    showId: row.show_id,
    action: row.action,
    actor: row.actor,
    changedFields: row.changed_fields,
    submitterName: row.submitter_name ?? "",
    submitterEmail: row.submitter_email ?? "",
    createdAt: row.created_at.toISOString(),
    show: { title: row.title, venue: row.venue_name, date: row.show_date },
  }));
}

export const SHOW_HISTORY_WINDOW_DAYS = WINDOW_DAYS;
export const SHOW_HISTORY_ROW_LIMIT = ROW_LIMIT;
