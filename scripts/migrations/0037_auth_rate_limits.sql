-- Rate limiting for the unauthenticated magic-link login endpoint
-- (app/api/auth/login). The existing rate_limits table (0009) is keyed on an
-- api_clients FK, so it can only guard the public API, not login — a caller
-- there has no client row. This table mirrors that fixed-window pattern but is
-- keyed on an arbitrary text bucket (e.g. "ip:1.2.3.4" or "email:foo@bar")
-- so the login route can throttle both spraying one address and spraying many.
--
-- Only counts + a truncated window are stored; no email/IP secrets beyond the
-- bucket string itself, which lib/authRateLimit.ts hashes-free but derives from
-- request metadata. Rows are pruned opportunistically on each write.
create table auth_rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  request_count int not null default 1,
  primary key (bucket, window_start)
);
