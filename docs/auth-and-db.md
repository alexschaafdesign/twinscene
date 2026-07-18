Auth, Accounts & Database Safety — Twin Scene
Operational context for coding agents in this repo. (Fuller design rationale lives in the team's Claude Project; this file is what you need day-to-day.) For the fuller auth/profile design + status narrative, see docs/architecture.md.
Auth & accounts model
* ONE users table is the single identity. Authorization is a SEPARATE layer:
    * users.is_admin → may edit ANY band.
    * band_editors(user_id, band_id, role) → which non-admin users may edit which bands (many-to-many).
* Permission check, ALWAYS server-side: canEditBand(user, bandId) = user.is_admin OR row in band_editors(user_id, band_id). Never gate on hidden UI — a missing button is not a permission check.
* Login is passwordless magic link: login_tokens (store a HASH of the token, single-use, ~15 min expiry) → sets an opaque sessions token in an HTTP-only, Secure, SameSite=Lax cookie. getCurrentUser() reads it. Logging in creates the user row — that IS signup; there is no separate signup flow.
* band_claims = a user requests a band; an admin approves, which inserts the band_editors row AND marks the claim decided in ONE transaction.
* Validate any login next/redirect param as same-origin relative only (open-redirect guard).
* Key files: lib/auth.ts (sessions, getCurrentUser, canEditBand, isAdmin, findOrCreateUserByEmail), lib/email.ts, app/api/auth/*, lib/bandEditors.ts, lib/bandClaims.ts, lib/savedBands.ts, admin UI under app/admin/* (gated on is_admin, NOT the old SCRAPE_SECRET cookie the rest of /admin uses).
Email
* Sends via Resend (HTTP fetch, no SDK). lib/email.ts logs the link to the console in dev when RESEND_API_KEY is unset, and throws in prod if unset.
* EMAIL_FROM = "Twin Scene <login@thebirdhaus.org>" — Resend free tier allows one verified domain, so Twin Scene borrows Birdhaus's verified domain (display name still reads "Twin Scene"). RESEND_API_KEY + EMAIL_FROM live in Vercel Production ONLY, not in local .env.local — so local logins print the magic link to the dev console.
DATABASE — READ BEFORE ANY MIGRATION OR WRITE
Neon Postgres. This repo shares its DB with Crawlspace (canonical bands, shared shows, all auth/user tables). Birdhaus has its OWN separate DB. Column types: shows.id is uuid (gen_random_uuid()); bands.id / users.id are bigint.
Dev/prod isolation — DO NOT UNDO:
* .env.local points at the Neon DEV branch. .envrc uses dotenv_if_exists .env.local so direnv watches the file and the shell can't go stale. Both files are gitignored.
* The shell's DATABASE_URL (exported by direnv) = DEV. scripts/migrate.mjs uses Node's process.loadEnvFile('.env.local'), which does NOT override an already-set env var — so it targets whatever the shell holds = DEV by default. This is intentional.
* scripts/whichdb.mjs prints which DB the repo is pointed at (host + current_database, and warns if the shell disagrees with .env.local). RUN IT before any write.
Rules:
* NEVER run test writes against prod. Test against the dev branch, or a seeded throwaway row with a guard that hard-fails if the target isn't the throwaway. Delete test rows after and verify zero leftovers.
* To target PROD deliberately (e.g. run a migration on prod), use a ONE-OFF prefix: DATABASE_URL='<prod-url>' node scripts/migrate.mjs Before applying, print current_database() + host and confirm it's the PROD host, not dev. Never write the prod URL to a file or commit it; never echo it back.
* Migrations are additive and sequential (scripts/migrations/NNNN_*.sql). Apply new migrations to PROD BEFORE deploying code that reads the new tables.
Deploy to prod
1. Confirm you're on dev via whichdb.mjs. Commit only the intended files (leave unrelated untracked work alone).
2. Apply new migration(s) to prod via the one-off DATABASE_URL='<prod>' prefix. Verify the host is prod; sanity-check it was additive (e.g. existing row counts unchanged).
3. Push to main — Vercel builds production from main.
4. Verify on the live site (twinscene.org).
Status (details in the team Claude Project doc)
* Phase 1 (admin editing) + Phase 2 (band self-editing, claim→approve, closed a public-write hole in app/api/bands/submit mode=correct) — SHIPPED to prod.
* Phase 3 (public profiles): slice 1 (save-a-band + /profile) SHIPPED to prod. Migration 0018 already created saved_bands, band_follows, show_saves. Slice 2 (follows + shows attendance: 'interested' | 'going' | 'went') is code-only — NO new migration needed.
This is a customized Next.js 16 build
Check node_modules/next/dist/docs/ before relying on framework-coupled behavior; APIs and conventions may differ from standard Next.js.
