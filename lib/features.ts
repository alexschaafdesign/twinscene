// Central feature flags.
//
// NEXT_PUBLIC_ so the value is available in both server and client components
// (inlined at build time). Shows are hidden unless explicitly enabled, so a
// production deploy that doesn't set the var ships the directory only.
//
// Enable locally by adding to .env.local:  NEXT_PUBLIC_SHOWS_ENABLED=true
export const SHOWS_ENABLED = process.env.NEXT_PUBLIC_SHOWS_ENABLED === "true";
