// Pure presentation helper shared by the header bell (client) and the /notifications
// page (server): turns a notification row into display text + a destination link.
// No server imports here so the client bundle stays clean — it's structurally
// compatible with lib/notifications' NotificationItem.

export interface NotificationView {
  type: "band_show" | "band_update" | "show_changed" | "new_message";
  data: { changed?: string[]; snippet?: string } | null;
  band_slug: string | null;
  band_name: string | null;
  show_id: string | null;
  show_title: string | null;
  show_date: string | null;
  venue_name: string | null;
  // 'new_message' fields (null/false for other types). See lib/notifications
  // NotificationItem for how these are resolved.
  conversation_id: string | null;
  conv_recipient_type: "band" | "musician" | null;
  conv_band_name: string | null;
  conv_musician_name: string | null;
  conv_initiator_name: string | null;
  conv_initiator_username: string | null;
  conv_viewer_is_initiator: boolean;
}

// "bio" → "bio", "members" → "lineup", etc. — the fan-facing label per changed field.
const FIELD_LABELS: Record<string, string> = {
  bio: "bio",
  photo: "photo",
  genre: "genre",
  location: "location",
  links: "links",
  members: "lineup",
  date: "date",
  venue: "venue",
};

function humanizeList(fields: string[]): string {
  const labels = fields.map((f) => FIELD_LABELS[f] ?? f);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// "2026-07-18" → "Sat, Jul 18". Parsed as a plain calendar date (no timezone
// shift) since the stored value is already America/Chicago wall-clock.
function formatDate(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function describeNotification(n: NotificationView): { text: string; href: string } {
  switch (n.type) {
    case "band_update": {
      const what = humanizeList(n.data?.changed ?? []);
      const band = n.band_name ?? "A band you follow";
      const text = what ? `${band} updated their ${what}` : `${band} updated their profile`;
      return { text, href: n.band_slug ? `/bands/${n.band_slug}` : "/profile#follows" };
    }
    case "band_show": {
      const band = n.band_name ?? "A band you follow";
      const at = n.venue_name ? ` at ${n.venue_name}` : "";
      const on = n.show_date ? ` on ${formatDate(n.show_date)}` : "";
      return {
        text: `${band} is playing ${n.show_title || "a show"}${at}${on}`,
        href: n.show_id ? `/shows/${n.show_id}` : "/shows",
      };
    }
    case "show_changed": {
      const what = humanizeList(n.data?.changed ?? []);
      const show = n.show_title || "A show you saved";
      const at = n.venue_name ? ` at ${n.venue_name}` : "";
      const tail = what ? ` — ${what} changed` : " was updated";
      return { text: `${show}${at}${tail}`, href: n.show_id ? `/shows/${n.show_id}` : "/shows" };
    }
    case "new_message": {
      // Bare band/musician name — reads better than the "Musician: X" inbox tag.
      const identity =
        (n.conv_recipient_type === "band" ? n.conv_band_name : n.conv_musician_name) ||
        (n.conv_recipient_type === "musician" ? "a musician" : "a band");
      const initiator =
        n.conv_initiator_name ||
        (n.conv_initiator_username ? `@${n.conv_initiator_username}` : "someone");
      const snippet = n.data?.snippet ? `: “${n.data.snippet}”` : "";
      // The initiator only ever hears from the recipient side; the recipient
      // side always hears about the thread with the initiator.
      const lead = n.conv_viewer_is_initiator
        ? `New message from ${identity}`
        : `${initiator} messaged ${identity}`;
      return {
        text: `${lead}${snippet}`,
        href: n.conversation_id ? `/profile/messages/${n.conversation_id}` : "/profile/messages",
      };
    }
  }
}

// "3h ago" / "2d ago" / "just now" — compact relative time for the inbox.
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
