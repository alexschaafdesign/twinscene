// Fixed-window rate limiting for the unauthenticated login endpoint.
//
// Mirrors the per-client limiter in lib/apiAuth.ts, but keyed on an arbitrary
// text bucket (IP or email) rather than an api_clients FK — the login route
// has no authenticated client. Backed by auth_rate_limits (migration 0037).
//
// Two levers are enforced at the call site (app/api/auth/login):
//   - per-email  → stops bombing one person's inbox with sign-in links
//   - per-IP     → stops one source spraying links at many addresses
// Either tripping rejects the request, so neither alone is a bypass.

import { sql } from "./db.ts";

// Window helper: floor now() to a fixed `windowSeconds` bucket so we can use
// windows other than the one-minute date_trunc the api_clients limiter uses
// (a 15-minute email window, an hour IP window). Postgres computes it so the
// bucket boundary can't drift with app-server clock skew.
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

// Increment the bucket's counter for the current window and report whether it
// is still within `limit`. The request being checked is counted (incremented
// before the comparison), matching the fixed-window behavior in apiAuth.ts.
// Opportunistically prunes windows older than a day so no cleanup cron is
// needed.
export async function allowAuthRequest(bucket: string, rule: RateLimitRule): Promise<boolean> {
  const [row] = await sql<Array<{ request_count: number }>>`
    insert into auth_rate_limits (bucket, window_start, request_count)
    values (
      ${bucket},
      to_timestamp(floor(extract(epoch from now()) / ${rule.windowSeconds}) * ${rule.windowSeconds}),
      1
    )
    on conflict (bucket, window_start)
    do update set request_count = auth_rate_limits.request_count + 1
    returning request_count
  `;

  await sql`delete from auth_rate_limits where window_start < now() - interval '1 day'`;

  return row.request_count <= rule.limit;
}
