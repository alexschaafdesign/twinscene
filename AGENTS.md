<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dev environments (two worktrees)

The Shows directory (scrapers, `app/shows/**`, `lib/shows/**`, `lib/scrapers/**`) is an
in-progress feature gated behind `NEXT_PUBLIC_SHOWS_ENABLED` (`lib/features.ts`). It's
developed in a separate git worktree so the stable build is never affected:

| Worktree | Branch | `NEXT_PUBLIC_SHOWS_ENABLED` | Dev port | Purpose |
|---|---|---|---|---|
| `~/twinscene` | `main` | `false` | 3000 | Stable build, Shows hidden |
| `~/twinscene-shows` | `shows` | `true` | 3001 | All Shows development |

- Each worktree has its own untracked `.env.local` (the flag value differs) and its own
  `node_modules`. `.env.local` does not copy across worktrees automatically.
- Commit Shows work on the `shows` branch only; `main` stays clean until `shows` is merged.
- Keep the branch fresh: from `~/twinscene-shows`, run `git merge main` periodically.
- Run each server on its own port: `npm run dev` (3000) and `npm run dev -- -p 3001`.
- Tear down: `git worktree remove ~/twinscene-shows` (then `git branch -D shows` to abandon).
