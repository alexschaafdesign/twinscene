// Canonical directory of music writers / journalists / bloggers covering the
// local scene, backing /writers and the /reads hub. Raw-SQL data layer over
// the `writers` table (migration 0063), a near-exact clone of lib/mediaPros.ts
// — a public directory row with bands-style self-editing bolted on
// (lib/writerEditors.ts, lib/writerClaims.ts). The writing itself lives in
// lib/articles.ts.

import { sql } from "./db.ts";
import type postgres from "postgres";
import { slugify } from "./writerUtils.ts";

export { slugify };

// Mirrors the `writers` columns exactly (snake_case), so a `select *` row IS a
// Writer with no transform.
export interface Writer {
  id: number;
  slug: string;
  name: string;
  bio: string | null;
  city: string | null;
  publication: string | null;
  website: string | null;
  substack_url: string | null;
  instagram: string | null;
  twitter: string | null;
  contact: string | null;
  photo: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAllWriters(): Promise<Writer[]> {
  return sql<Writer[]>`select * from writers order by name asc`;
}

export interface WriterWithCount extends Writer {
  article_count: number;
}

// Directory listing: every writer with how many published pieces they have,
// so the /writers grid can show "12 pieces" without an N+1.
export async function getAllWritersWithCounts(): Promise<WriterWithCount[]> {
  return sql<WriterWithCount[]>`
    select writers.*, count(articles.id) filter (where articles.status = 'published')::int as article_count
    from writers
    left join articles on articles.writer_id = writers.id
    group by writers.id
    order by writers.name asc
  `;
}

export async function getWriterBySlug(slug: string): Promise<Writer | null> {
  const [row] = await sql<Writer[]>`select * from writers where slug = ${slug} limit 1`;
  return row ?? null;
}

export async function getWriterById(id: number): Promise<Writer | null> {
  const [row] = await sql<Writer[]>`select * from writers where id = ${id} limit 1`;
  return row ?? null;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from writers where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface WriterSubmissionInput {
  name: string;
  bio: string;
  city: string;
  publication: string;
  website: string;
  substackUrl: string;
  instagram: string;
  twitter: string;
  contact: string;
  photoUrl?: string; // set when a new photo was just uploaded (lib/r2.ts)
  thumbnailUrl?: string;
  removePhoto?: boolean;
}

export interface UpsertWriterResult {
  writer: Writer;
  action: "created" | "updated";
}

/**
 * Create or update a writer from the submit/correct form. `mode: "correct"`
 * looks the row up by `existingSlug` and updates it in place; `mode: "add"`
 * generates a fresh unique slug from the name. Runs in a transaction so the
 * lookup/slug-generation/write can't race a concurrent submission — mirrors
 * lib/mediaPros.ts's upsertMediaPro.
 */
export async function upsertWriter(
  input: WriterSubmissionInput,
  mode: "add" | "correct",
  existingSlug?: string,
): Promise<UpsertWriterResult> {
  return sql.begin(async (tx) => {
    const existing =
      mode === "correct" && existingSlug
        ? ((await tx<Writer[]>`select * from writers where slug = ${existingSlug} limit 1`)[0] ?? null)
        : null;

    let photo = existing?.photo ?? null;
    let thumbnailUrl = existing?.thumbnail_url ?? null;
    if (input.removePhoto) {
      photo = null;
      thumbnailUrl = null;
    }
    if (input.photoUrl) photo = input.photoUrl;
    if (input.thumbnailUrl) thumbnailUrl = input.thumbnailUrl;

    if (existing) {
      const [updated] = await tx<Writer[]>`
        update writers set
          name = ${input.name},
          bio = ${input.bio || null},
          city = ${input.city || null},
          publication = ${input.publication || null},
          website = ${input.website || null},
          substack_url = ${input.substackUrl || null},
          instagram = ${input.instagram || null},
          twitter = ${input.twitter || null},
          contact = ${input.contact || null},
          photo = ${photo},
          thumbnail_url = ${thumbnailUrl},
          updated_at = now()
        where id = ${existing.id}
        returning *
      `;
      return { writer: updated, action: "updated" as const };
    }

    const slug = await uniqueSlug(tx, slugify(input.name) || "writer");
    const [created] = await tx<Writer[]>`
      insert into writers (
        slug, name, bio, city, publication, website, substack_url,
        instagram, twitter, contact, photo, thumbnail_url
      ) values (
        ${slug}, ${input.name}, ${input.bio || null}, ${input.city || null},
        ${input.publication || null}, ${input.website || null}, ${input.substackUrl || null},
        ${input.instagram || null}, ${input.twitter || null}, ${input.contact || null},
        ${photo}, ${thumbnailUrl}
      )
      returning *
    `;
    return { writer: created, action: "created" as const };
  });
}
