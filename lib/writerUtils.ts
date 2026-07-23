// Pure writer helpers with no server-only dependencies, mirroring
// lib/mediaProUtils.ts's role for media pros: lib/writers.ts (the Postgres
// data layer) imports lib/db.ts, which pulls in the `postgres` client —
// importing that chain into a client component would bundle `postgres` into
// the browser. Client components that only need slugify() import from here.

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The four kinds of scene entity an article can be cross-linked to. Matches
// the article_entities.entity_type check constraint (migration 0063). Kept
// here (client-safe) so the article-tagging UI can import it without pulling
// in the postgres client.
export type ArticleEntityType = "band" | "show" | "venue" | "musician";

export const ARTICLE_ENTITY_TYPES: ArticleEntityType[] = ["band", "show", "venue", "musician"];
