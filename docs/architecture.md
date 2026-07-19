Twin Scene — Auth, Accounts & Profiles
Design + status record. Stack: Next.js 16 (App Router, customized build) + React 19 + TS on Vercel; shared Postgres (raw SQL via postgres.js, no ORM; Neon-hosted); Twin Scene owns canonical bands + shared shows; Birdhaus & Crawlspace consume via API; images on Cloudflare R2. Migrations through 0028, all on prod. (Outstanding: the now-orphaned saved_bands table still needs its follow-up drop migration.) (Terse operational rules live in CLAUDE.md / docs/auth-and-db.md; this doc is the fuller design + status narrative.)
Status — all shipped to prod unless noted
Auth foundation
* Phase 1 — magic-link login + admin-gated band editing. users, sessions, login_tokens, band_editors (migration 0016). Admin: alex.schaaf@gmail.com (user id 1).
* Phase 2 — band self-editing via band_editors, admin assignment, claim→approve flow (band_claims, migration 0017). Also closed a public-write security hole: app/api/bands/submit (mode:"correct") was unauthenticated (anyone could overwrite any band — root cause of the "58 Belvedere" overwrite); now canEditBand-gated.
* Email: sends via Resend from EMAIL_FROM="Twin Scene <login@thebirdhaus.org>" (Resend free tier = 1 domain, so Twin Scene borrows Birdhaus's verified domain; inbox shows "Twin Scene"). RESEND_API_KEY+EMAIL_FROM in Vercel Production only — local dev logs the link to the console.
Phase 3 — public profiles (the original vision)
* Slice 1 — save-a-band + /profile (migration 0018 created all three collection tables at once: saved_bands, band_follows, show_saves).
* Slice 2 — follow-a-band + show attendance (show_saves.status = 'interested'|'going'|'went'; "I went to this" = 'went'). No migration (0018 covered it).
* Saves + follows merged into ONE gesture (migration 0028, shipped — prod had 0 saved_bands so the data merge was a no-op there; dev merged 1 save + 1 follow into 2 rows). They were structurally identical tables split only by semantics — saved = public bookmark, follow = notification subscription. One heart now means both. band_follows survives (notifications already fan out over it); 0028 unions saved_bands into it keeping the earlier timestamp, and adds band_follows_band_id_idx (the composite PK can't serve the band_id-only fan-out lookup). saved_bands is deliberately left in place, unread — dropping it in the same migration that ships the code means a rollback lands on a missing table; a follow-up migration drops it once verified. Behavior change: save-only users now get that band's notifications, and their follows show on their public profile.
* Frontend Slice A — auth UX: unified "Sign in / Sign up" passwordless page, account menu (avatar-or-monogram dropdown), logout, and long ~90-day "remember me" sessions so returning users rarely re-auth.
* Frontend Slice B — profile identity: username (case-insensitive unique) + bio on users (migration 0019; name/image_url already existed), profile-edit page, and avatar upload to R2 (reuses the band-photo sharp→WebP pipeline; server-controlled key avatars/<userId>/…, EXIF stripped, size-capped).
* Frontend Slice C — public profiles at /u/[username] (migration 0020: profile_public boolean not null default true). Public by default; per-user private toggle. Public page shows avatar, name, @username, bio, status, followed bands (saved bands after the 0028 merge), attended shows, and stats (shows attended all-time + this year). Deliberately never shows email or future/going shows (getUserByUsername selects an explicit column list without email; queries scoped to status='went'). Private + non-owner → minimal avatar/name state; private + owner → full profile with a "only you can see this" note; noindex when private.
Musicians — people as first-class entities
* Slice 1 (migration 0021) — turned the free-text bands.members jsonb array into real rows: musicians (name, slug, nullable+unique user_id, bio, image_url) + band_members join table (role nullable — the source strings never carried one; position preserves the original array order so rendering doesn't shuffle). Backfilled by scripts/backfill_musicians.mjs, deduping case-insensitively so two bands listing "Alex" resolve to one musician. bands.members was NOT dropped — it stays as a frozen backup.
* Slice 2 (migration 0022) — musician_claims: a user claims a musician identity, an admin approves, approval links musicians.user_id AND grants band_editors for every band that musician is in. Superseded by Slice B below; the table was dropped in 0024 (no real prod data), not migrated.
* Slice 3 — public musician pages at /m/[slug] + musician profile editing (lib/musicians.ts: canEditMusician, updateMusicianProfile, avatar upload reusing the band-photo sharp→WebP pipeline).
Band ownership — verified bands run themselves
* Slice A (migration 0023) — ownership via redemption codes. An admin verifies a band's Instagram out-of-band, generates a one-time code, DMs it; redeeming at /redeem grants the elevated band_editors role = 'owner' (existing column, no schema change). Mirrors login_tokens: only a HASH of the code is stored, plaintext exists only in the admin's one-time generate response. Codes expire (~30 days), single-redemption. lib/bandOwnership.ts: generateOwnershipCode, redeemOwnershipCode, isBandOwner, bandHasOwner, listOwnedBands.
* Slice B (migration 0024) — membership claims became BAND-scoped ("I'm <musician> in <band>"), approved by that band's OWNER with admin as fallback for ownerless bands. This is the point of the owner role: approval authority delegated out of the admin queue. Replaces musician_claims, which granted editor rights on every band a musician appeared in and could only be reviewed by an admin. lib/bandMemberClaims.ts (canApproveMemberClaim, listPendingClaimsForOwner, decideMemberClaim); partial unique index allows one open claim per (user, band, musician) triple while still letting a user have several different pending claims.
Notifications, statuses, feed
* last_seen_at (migration 0025) — stamped on a throttled ~hourly cadence from getCurrentUser, so the admin users view shows real activity. sessions.created_at undercounts: the 90-day sliding renewal pushes expires_at without touching created_at. Nullable, no default — existing rows read "never seen" until their owner's next authenticated request.
* In-app notification inbox (migration 0026, /notifications) — three types, all fan-out-on-write from Twin Scene's own write paths (lib/notifications.ts, called from lib/shows.ts and lib/bands.ts): 'band_show' (a band you follow was added to a future show), 'band_update' (a band you follow edited its profile), 'show_changed' (a show you saved changed date/venue). Delivery is in-app only; the schema leaves a clean seam for email digests reading unread rows. Partial indexes do the real work: band_show is deduped FOREVER per (user, band, show) so nightly re-scrapes can't re-notify (ON CONFLICT DO NOTHING); band_update and show_changed coalesce while UNREAD (read_at is part of the index predicate) so three saves in a row bump one row instead of spamming — once read, the next edit earns a fresh row.
* Per-show pages at /shows/[id] — landing targets for show notifications and saves.
* User statuses (migration 0027) — old-Facebook-style "[name] is ... [status]": one short line set from your own profile, shown on /profile and (if public) /u/[username]. status_at records when it was set so the UI can render "2 hours ago" and a stale status reads as stale. Both columns clear together.
* Feed (/feed, lib/feed.ts) — site-wide activity as a union of item kinds (statuses + band follows today), so future sources (new bands, shows added, videos) merge in by adding a FeedItem variant + a loader. Follows are grouped per user per hour: a follow is an event, not state, and the directory encourages hearting a pile of bands at signup — ungrouped, one person would bury the feed. The hour bucket is deliberately crude; splitting a long session into a few rows is the harmless failure, twenty rows is the bad one. PRIVACY: it's a public unauthenticated page, so every loader must filter to what's already publicly visible — statuses and follows alike are limited to users who are BOTH profile_public AND have a username (i.e. exactly those with a reachable /u/[username], where those follows are already listed). The rule lives per-loader, not in getFeed(); any new item kind needs its own check.
Admin
* One unified is_admin dashboard (app/admin/*, shared AdminNav in app/admin/layout.tsx) covering bands, shows, review, claims, band-member-claims, activity, and users. SCRAPE_SECRET no longer gates any PAGE — the is_admin-gated pages read it server-side and hand it to their client panels so those panels' calls to the still-SCRAPE_SECRET-gated show/scrape APIs authenticate.
Decisions / deferred
* Login method: magic-link only (chose this over passwords — passwords roughly double the auth surface and add reset + rate-limiting flows for the one thing magic links already prove: email ownership). Long sessions solve repeat-login friction. Google sign-in is the likeliest future add if wanted.
* Cross-site "one login" (Twin Scene / Crawlspace / Birdhaus): deferred. Cost hinges on domain structure — subdomains of twinscene.org → a .twinscene.org cookie works with near-zero code; separate domains → a redirect/token SSO flow (strongest argument for Clerk/Auth0). Twin Scene + Crawlspace already share the DB (identity data is shared; only the cookie separates them); Birdhaus has its own DB.
* ⚠️ Secret rotation pending: R2 keys + SCRAPE_SECRET were printed into a chat transcript during a direnv fix (not a git leak). Rotate when convenient; the Vercel OIDC token was self-expiring, ignore.
* Leaderboard (future, "most shows this year"): data already exists — count show_saves where status='went', filtered by year. Respect profile_public (private users excluded). No new schema needed.
* Moderation for public user content: not yet built; worth considering as signups grow.
Core idea: one identity, layered authorization
ONE users table is the single identity; authorization is a SEPARATE layer. users.is_admin → edit ANY band. band_editors(user_id, band_id) → which non-admin users edit which bands. Check, always server-side: canEditBand(user, bandId) = is_admin OR row in band_editors. Never gate on hidden UI. This is why each feature (self-editing, claims, saves, follows, attendance, profiles) snapped on without reworking identity — same users table throughout.
Schema (raw SQL, shared Postgres, owned by Twin Scene)
users        (id bigint pk, email unique, name, username, bio, image_url,
              profile_public boolean not null default true,
              is_admin boolean not null default false, created_at,
              last_seen_at, status, status_at)
              -- unique index on lower(username); email NEVER exposed publicly
              -- last_seen_at stamped ~hourly from getCurrentUser (0025)
              -- status/status_at = the profile status line (0027), clear together
band_editors (user_id→users, band_id→bands, role default 'editor', pk(user_id,band_id))
              -- role 'editor' | 'owner'; 'owner' (via redeemed code) may also
              --   approve that band's member claims
sessions     (id text pk = opaque cookie token, user_id→users, expires_at, created_at)  -- ~90d
login_tokens (token pk = HASH, email, expires_at, created_at)  -- single-use, ~15min
band_claims  (id pk, user_id→users, band_id→bands, status default 'pending',
              created_at, decided_at, decided_by→users)  -- + partial unique idx: 1 pending/user/band
saved_bands  (user_id→users, band_id→bands, created_at, pk(user_id,band_id))
              -- DEAD as of 0028: unioned into band_follows, nothing reads it.
              --   Left in place so a code rollback doesn't hit a missing table;
              --   a follow-up migration drops it.
band_follows (user_id→users, band_id→bands, created_at, pk(user_id,band_id))
              -- THE heart: public bookmark + notification subscription in one.
              --   band_follows_band_id_idx serves the notification fan-out (0028)
show_saves   (user_id→users, show_id uuid→shows, status, created_at, pk(user_id,show_id))
              -- status 'interested'|'going'|'went'; shows.id is uuid (gen_random_uuid())
musicians    (id bigint pk, name, slug unique, user_id unique→users (nullable),
              bio, image_url, created_at)   -- index on lower(name)
band_members (band_id→bands, musician_id→musicians, role (nullable), position,
              created_at, pk(band_id,musician_id))
band_member_claims
             (id pk, user_id→users, band_id→bands, musician_id→musicians,
              status default 'pending', created_at, decided_at, decided_by→users)
              -- partial unique idx: 1 pending per (user,band,musician) triple
band_ownership_codes
             (id pk, band_id→bands, code_hash, created_by→users, created_at,
              expires_at, redeemed_by→users, redeemed_at)  -- HASH only, never raw
notifications
             (id bigserial pk, user_id→users, type, band_id→bands (nullable),
              show_id uuid→shows (nullable), data jsonb, read_at, created_at)
              -- type 'band_show'|'band_update'|'show_changed'; which id is set
              --   depends on type. Partial indexes: band_show deduped forever;
              --   band_update/show_changed coalesce only while read_at is null.
              -- Twin-Scene-owned; Crawlspace neither reads nor writes it.
Auth mechanism (hand-rolled — chosen over Auth.js/Clerk)
sessions + HTTP-only, Secure, SameSite=Lax cookie holding an opaque token; magic-link login (login_tokens, hashed, single-use). Chosen because it depends only on standard web primitives + your Postgres — won't fight the customized Next 16 build, keeps identity native to the DB. Auth.js couples to Next internals and wants a pg adapter (you use postgres.js); Clerk is the fallback if cross-site login across all three domains becomes a priority.
Database safety (learned the hard way — see docs/auth-and-db.md)
* Neon. Twin Scene + Crawlspace share one DB (dev branch ep-cool-poetry-...); Birdhaus has its own (ep-calm-bonus-...). Prod host ep-small-cell-atttlq50-....
* All three repos: .envrc uses dotenv_if_exists .env.local so direnv watches the file → the shell can't go stale (this was the root cause of the early "everything hit prod" confusion). .env.local points at the DEV branch.
* scripts/migrate.mjs uses process.loadEnvFile, which does NOT override an already-set env var → targets the shell's DATABASE_URL (dev) by default. To hit prod: one-off DATABASE_URL='<prod>' node scripts/migrate.mjs, after printing current_database()+host and confirming it's prod.
* scripts/whichdb.mjs = the standing "am I on prod?" check. Run before any write.
* Additive migrations to prod BEFORE the code deploy. Never test-write prod (use dev branch or a seeded throwaway row). R2 is shared prod storage (not branched) — namespace + clean up test uploads.
Guardrails
* Authorize server-side; a hidden button is not a check.
* Validate login next/redirect params as same-origin relative only (open-redirect guard).
* Public routes: select explicit column lists that exclude email; scope queries so private data (email, future shows) can't leak — verify by reading the SQL, not just the UI.
* Aggregate public surfaces (the feed) must filter per item kind to what's already publicly reachable — profile_public AND username for statuses. A new feed source without its own check is a leak, not a missing feature.
* Approval authority is data, not UI: member claims check canApproveMemberClaim (band owner, admin fallback) server-side; ownership codes are hashed, expiring, single-use.
* Avatars/uploads: re-encode via sharp (strips EXIF), cap size, server-controlled key, images only.
* Username uniqueness enforced by BOTH app check and the unique index (catch the unique-violation race → friendly "taken" error); reserved-word list covers existing + future routes.
* Hash magic-link tokens; single-use, ~15 min.
* Passwords, if ever added: argon2id/bcrypt, never plaintext.
* Customized Next 16 — check node_modules/next/dist/docs/ before relying on framework-coupled behavior.
Deploy playbook (proven across 0016–0028)
1. Confirm dev via whichdb.mjs; commit the intended files only.
2. Apply new migration(s) to prod via the one-off DATABASE_URL='<prod>' prefix; confirm host = prod; sanity-check additive (row counts unchanged).
3. Push to main (Vercel builds prod from main) — after the migration.
4. Verify on the live site.
