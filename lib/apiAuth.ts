// Auth + rate limiting for the public /api/public/* endpoints.
//
// Flow (auth first, then rate limiting — rate limiting is per-client, so we
// need the resolved client id before we can count against it):
//   1. Read the `x-api-key` header (same header Birdhaus's public API uses).
//   2. SHA-256 the key, look it up in api_clients; reject 401 if missing/revoked.
//   3. Fixed-window per-minute counter in rate_limits; reject 429 over 100/min.
//
// Keys are only ever stored as their SHA-256 hash — the plaintext is never
// persisted (see scripts/create-api-client.mjs).

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sql } from "@/lib/db";

// The authenticated caller, attached to the request context for downstream use.
export interface ApiClient {
  id: number;
  name: string;
  can_write: boolean;
}

const RATE_LIMIT_PER_MINUTE = 100;

// CORS governs which browser-side JS can call this directly — it is not the
// access control; the x-api-key check is. Mirrors Birdhaus's public endpoint.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
} as const;

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
}

// Discriminated result: on success carries the resolved client, otherwise the
// error response to short-circuit the handler with.
type AuthResult = { client: ApiClient } | { response: NextResponse };

// Step 2: resolve the caller from the x-api-key header.
async function authenticate(request: Request): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return { response: errorResponse("Missing x-api-key header", 401) };
  }

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const [client] = await sql<ApiClient[]>`
    select id, name, can_write
    from api_clients
    where key_hash = ${keyHash} and revoked_at is null
    limit 1
  `;
  if (!client) {
    return { response: errorResponse("Invalid or revoked API key", 401) };
  }

  return { client };
}

// Step 3: fixed-window per-client counter. Truncates now() to the minute for the
// window, upsert-increments the count, and rejects once it exceeds the limit.
// The offending request still counts (it's incremented before the check), which
// is the intended fixed-window behavior. Opportunistically prunes windows older
// than a day on each write so no separate cleanup cron is needed.
async function checkRateLimit(clientId: number): Promise<NextResponse | null> {
  const [row] = await sql<Array<{ request_count: number }>>`
    insert into rate_limits (client_id, window_start, request_count)
    values (${clientId}, date_trunc('minute', now()), 1)
    on conflict (client_id, window_start)
    do update set request_count = rate_limits.request_count + 1
    returning request_count
  `;

  await sql`delete from rate_limits where window_start < now() - interval '1 day'`;

  if (row.request_count > RATE_LIMIT_PER_MINUTE) {
    return errorResponse("Rate limit exceeded", 429);
  }
  return null;
}

// Wraps auth (step 2) then rate limiting (step 3) for a request. Pass
// { requireWrite: true } on mutating endpoints — a client without can_write is
// rejected 403. Returns the resolved client on success, or an error response
// (401/403/429) to return directly from the handler.
export async function authorize(
  request: Request,
  opts: { requireWrite?: boolean } = {},
): Promise<AuthResult> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth;

  const limited = await checkRateLimit(auth.client.id);
  if (limited) return { response: limited };

  if (opts.requireWrite && !auth.client.can_write) {
    return { response: errorResponse("Forbidden: write access required", 403) };
  }

  return { client: auth.client };
}
