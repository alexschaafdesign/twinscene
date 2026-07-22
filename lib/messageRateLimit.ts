// Rate limiting for message sending (slice 4, anti-abuse). Reuses the generic
// fixed-window bucket counter from lib/authRateLimit (auth_rate_limits table,
// migration 0037) — the same mechanism the login endpoint uses — keyed on the
// sending user. Two windows, both enforced: a short burst cap stops rapid-fire
// spamming, an hourly cap stops a slow drip that stays under the burst limit.
// Either tripping rejects the send, so neither alone is a bypass. Both are far
// above what a real person sends while having conversations.

import { allowAuthRequest } from "./authRateLimit.ts";

const BURST_RULE = { limit: 15, windowSeconds: 60 } as const; // 15 / minute
const HOURLY_RULE = { limit: 100, windowSeconds: 60 * 60 } as const; // 100 / hour

// Records one send attempt for `userId` against both windows and returns whether
// it's allowed. Both buckets are incremented (so an over-limit attempt still
// counts — a caller hammering past the cap keeps tripping it), matching the
// fixed-window semantics of the auth limiter. Distinct bucket keys per window
// so the two counters don't collide.
export async function allowMessageSend(userId: number): Promise<boolean> {
  const [burstOk, hourlyOk] = await Promise.all([
    allowAuthRequest(`msg:burst:${userId}`, BURST_RULE),
    allowAuthRequest(`msg:hourly:${userId}`, HOURLY_RULE),
  ]);
  return burstOk && hourlyOk;
}
