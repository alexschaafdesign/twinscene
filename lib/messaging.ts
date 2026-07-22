// Data layer for unified messaging (migration 0053), slice 1: bands and
// musicians are messageable; a user's inbox aggregates every conversation
// addressed to any identity they hold (bands they edit + their linked
// musician) plus every conversation they initiated.
//
// Authorization lives here and in the route handlers — never client-trusted.
// The two rules mirror the rest of the app:
//   - band recipient:     canEditBand(user, bandId)      (lib/auth.ts)
//   - musician recipient:  musicians.user_id === user.id  (lib/musicians.ts)

import { sql } from "./db.ts";
import { canEditBand, type User } from "./auth.ts";
import { canEditMusician } from "./musicians.ts";

export type RecipientType = "band" | "musician";

export interface Conversation {
  id: string;
  recipient_type: RecipientType;
  recipient_id: number;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: number;
  sender_as_type: RecipientType | null;
  sender_as_id: number | null;
  body: string;
  created_at: string;
}

// The set of recipient identities a user "owns" for inbox aggregation.
//
// bandIds comes from actual band_editors rows, NOT canEditBand — an admin can
// edit every band but should not have every band's DMs dumped into their
// personal inbox. (An admin can still open a specific band thread by URL; that
// gate is canEditBand, applied in canViewConversation.) A user has at most one
// linked musician (musicians.user_id is unique).
export async function getUserIdentities(
  userId: number,
): Promise<{ bandIds: number[]; musicianId: number | null }> {
  const [bandRows, musicianRows] = await Promise.all([
    sql<{ band_id: number }[]>`
      select band_id from band_editors where user_id = ${userId}
    `,
    sql<{ id: number }[]>`
      select id from musicians where user_id = ${userId} limit 1
    `,
  ]);
  return {
    bandIds: bandRows.map((r) => r.band_id),
    musicianId: musicianRows[0]?.id ?? null,
  };
}

// One thread per (human initiator, recipient) pair — messaging the same band
// twice reuses the existing conversation rather than spawning a new one. The
// initiator is recorded in conversation_participants; the recipient identity in
// conversations.recipient_type/id.
export async function getOrCreateConversation({
  initiatorUserId,
  recipientType,
  recipientId,
}: {
  initiatorUserId: number;
  recipientType: RecipientType;
  recipientId: number;
}): Promise<Conversation> {
  const [existing] = await sql<Conversation[]>`
    select c.*
    from conversations c
    join conversation_participants p
      on p.conversation_id = c.id and p.user_id = ${initiatorUserId}
    where c.recipient_type = ${recipientType}
      and c.recipient_id = ${recipientId}
    limit 1
  `;
  if (existing) return existing;

  return sql.begin(async (tx) => {
    const [conversation] = await tx<Conversation[]>`
      insert into conversations (recipient_type, recipient_id)
      values (${recipientType}, ${recipientId})
      returning *
    `;
    await tx`
      insert into conversation_participants (conversation_id, user_id)
      values (${conversation.id}, ${initiatorUserId})
    `;
    return conversation;
  });
}

// Persist a message and bump the conversation's last_message_at. When
// senderAsType is set (an editor/linked-musician replying on the recipient
// side), authorization for that identity is re-verified server-side here — a
// caller cannot fake sending as a band/musician they don't control.
export async function sendMessage({
  conversationId,
  sender,
  senderAsType,
  senderAsId,
  body,
}: {
  conversationId: string;
  sender: User;
  senderAsType?: RecipientType | null;
  senderAsId?: number | null;
  body: string;
}): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message body is empty");

  if (senderAsType) {
    if (senderAsId == null) throw new Error("senderAsId required when senderAsType is set");
    const authorized =
      senderAsType === "band"
        ? await canEditBand(sender, senderAsId)
        : await canEditMusician(sender, senderAsId);
    if (!authorized) {
      throw new Error("Not authorized to send as this identity");
    }
  }

  return sql.begin(async (tx) => {
    const [message] = await tx<Message[]>`
      insert into messages (conversation_id, sender_user_id, sender_as_type, sender_as_id, body)
      values (
        ${conversationId},
        ${sender.id},
        ${senderAsType ?? null},
        ${senderAsType ? senderAsId ?? null : null},
        ${trimmed}
      )
      returning *
    `;
    await tx`
      update conversations set last_message_at = now() where id = ${conversationId}
    `;
    return message;
  });
}

export interface InboxRow {
  id: string;
  recipient_type: RecipientType;
  recipient_id: number;
  last_message_at: string;
  unread: boolean;
  // The human who initiated the thread (the "other party" from a band/musician
  // POV). name/username may be null for a bare account.
  initiator_user_id: number | null;
  initiator_name: string | null;
  initiator_username: string | null;
  last_body: string | null;
  // Display label for the addressed identity, e.g. "Yellow Ostrich" or
  // "Musician: Alex Schaaf".
  tag: string;
}

// Every conversation the user may see, newest first: threads addressed to a
// band they edit, to their linked musician, OR that they initiated. A left
// join on conversation_reads for THIS user computes unread (no row, or a new
// message since last_read_at). The WHERE clause is the security boundary —
// nothing a user neither initiated nor holds the recipient identity for can
// appear here.
export async function getInboxForUser(userId: number): Promise<InboxRow[]> {
  const { bandIds, musicianId } = await getUserIdentities(userId);

  const rows = await sql<
    {
      id: string;
      recipient_type: RecipientType;
      recipient_id: number;
      last_message_at: string;
      unread: boolean;
      initiator_user_id: number | null;
      initiator_name: string | null;
      initiator_username: string | null;
      last_body: string | null;
      band_name: string | null;
      musician_name: string | null;
    }[]
  >`
    select
      c.id,
      c.recipient_type,
      c.recipient_id,
      c.last_message_at,
      (cr.last_read_at is null or c.last_message_at > cr.last_read_at) as unread,
      p.user_id as initiator_user_id,
      iu.name as initiator_name,
      iu.username as initiator_username,
      lm.body as last_body,
      b.name as band_name,
      m.name as musician_name
    from conversations c
    left join conversation_reads cr
      on cr.conversation_id = c.id and cr.user_id = ${userId}
    left join conversation_participants p on p.conversation_id = c.id
    left join users iu on iu.id = p.user_id
    left join lateral (
      select body from messages
      where conversation_id = c.id
      order by created_at desc
      limit 1
    ) lm on true
    left join bands b on c.recipient_type = 'band' and b.id = c.recipient_id
    left join musicians m on c.recipient_type = 'musician' and m.id = c.recipient_id
    where (c.recipient_type = 'band' and c.recipient_id = any(${bandIds}::bigint[]))
       or (c.recipient_type = 'musician' and c.recipient_id = ${musicianId})
       or p.user_id = ${userId}
    order by c.last_message_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    recipient_type: r.recipient_type,
    recipient_id: r.recipient_id,
    last_message_at: r.last_message_at,
    unread: r.unread,
    initiator_user_id: r.initiator_user_id,
    initiator_name: r.initiator_name,
    initiator_username: r.initiator_username,
    last_body: r.last_body,
    tag:
      r.recipient_type === "band"
        ? r.band_name ?? "Band"
        : `Musician: ${r.musician_name ?? "Unknown"}`,
  }));
}

// True if `user` may view/reply to `conversation`: the initiator, OR holds the
// recipient identity (canEditBand for a band, linked musician for a musician).
// This same check gates marking a thread read — a user can't mark read a thread
// they can't see.
export async function canViewConversation(
  user: User | null,
  conversation: Pick<Conversation, "id" | "recipient_type" | "recipient_id">,
): Promise<boolean> {
  if (!user) return false;

  const recipientSide =
    conversation.recipient_type === "band"
      ? await canEditBand(user, conversation.recipient_id)
      : await canEditMusician(user, conversation.recipient_id);
  if (recipientSide) return true;

  const [row] = await sql`
    select 1 from conversation_participants
    where conversation_id = ${conversation.id} and user_id = ${user.id}
    limit 1
  `;
  return !!row;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const [row] = await sql<Conversation[]>`
    select * from conversations where id = ${conversationId} limit 1
  `;
  return row ?? null;
}

export interface ThreadView {
  conversation: Conversation;
  tag: string;
  initiator: { id: number; name: string | null; username: string | null } | null;
  messages: Message[];
  // How the current viewer speaks in this thread. The initiator always sends
  // as themselves (null identity); anyone on the recipient side sends AS the
  // band/musician. We prioritise the initiator role so a thread's initiator
  // never accidentally replies wearing the recipient's identity.
  replyAs:
    | { kind: "self" }
    | { kind: "identity"; type: RecipientType; id: number };
}

// Full thread for a viewer, authorization already assumed checked by the
// caller via canViewConversation. Resolves the display tag, the initiator, the
// ordered messages, and how this viewer replies.
export async function getThreadForUser(
  conversation: Conversation,
  user: User,
): Promise<ThreadView> {
  const [messages, initiatorRow, tag] = await Promise.all([
    sql<Message[]>`
      select * from messages where conversation_id = ${conversation.id}
      order by created_at asc
    `,
    sql<{ id: number; name: string | null; username: string | null }[]>`
      select u.id, u.name, u.username
      from conversation_participants p
      join users u on u.id = p.user_id
      where p.conversation_id = ${conversation.id}
      order by p.created_at asc
      limit 1
    `,
    resolveTag(conversation),
  ]);

  const [isInitiator] = await sql`
    select 1 from conversation_participants
    where conversation_id = ${conversation.id} and user_id = ${user.id}
    limit 1
  `;

  const replyAs = isInitiator
    ? ({ kind: "self" } as const)
    : ({
        kind: "identity",
        type: conversation.recipient_type,
        id: conversation.recipient_id,
      } as const);

  return {
    conversation,
    tag,
    initiator: initiatorRow[0] ?? null,
    messages,
    replyAs,
  };
}

async function resolveTag(
  conversation: Pick<Conversation, "recipient_type" | "recipient_id">,
): Promise<string> {
  if (conversation.recipient_type === "band") {
    const [b] = await sql<{ name: string }[]>`
      select name from bands where id = ${conversation.recipient_id} limit 1
    `;
    return b?.name ?? "Band";
  }
  const [m] = await sql<{ name: string }[]>`
    select name from musicians where id = ${conversation.recipient_id} limit 1
  `;
  return `Musician: ${m?.name ?? "Unknown"}`;
}

// Upsert this user's last_read_at for a thread. Caller MUST have already
// confirmed canViewConversation — one editor reading does not mark it read for
// the band's other editors (per-person tracking).
export async function markConversationRead({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: number;
}): Promise<void> {
  await sql`
    insert into conversation_reads (conversation_id, user_id, last_read_at)
    values (${conversationId}, ${userId}, now())
    on conflict (conversation_id, user_id)
    do update set last_read_at = now()
  `;
}
