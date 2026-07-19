/** Coarse "when was this set" label for a user status — "just now", "3h ago",
 * "Apr 12". Deliberately low-resolution: the point is only to signal whether a
 * status is current or stale. Shared by the /profile editor (client) and the
 * public profile page (server); both render under `dynamic = "force-dynamic"`,
 * so there's no stale-prerender mismatch to worry about. */
export function formatStatusAge(statusAt: string | Date): string {
  const then = new Date(statusAt);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
