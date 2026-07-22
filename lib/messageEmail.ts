// Email side of message notifications (migration 0055). Called by
// sendMessage AFTER its transaction commits, for exactly the recipients whose
// in-app notification was freshly created (see notifyNewMessage) — so a burst
// of replies into one unread thread is a single email, not a stream. Purely
// best-effort: the caller swallows failures so a Resend hiccup never fails the
// message send.

import { sql } from "./db.ts";
import { sendEmail } from "./email.ts";

// Absolute base for links in email. Prefer the request origin the route passes
// through; fall back to the canonical prod host (email is only actually sent in
// prod, where RESEND_API_KEY is set — dev logs to the console via lib/email).
const FALLBACK_ORIGIN = "https://twinscene.org";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ConversationContext {
  recipient_type: "band" | "musician";
  identity_name: string | null;
  initiator_user_id: number | null;
  initiator_name: string | null;
  initiator_username: string | null;
}

// Send a new-message email to each freshly-notified recipient who hasn't opted
// out. recipientIds come straight from notifyNewMessage (already excludes the
// sender and coalesced recipients); we still re-check notify_email_messages
// per row so a stale toggle can't leak an email.
export async function dispatchNewMessageEmails({
  conversationId,
  recipientIds,
  snippet,
  origin,
}: {
  conversationId: string;
  recipientIds: number[];
  snippet: string;
  origin?: string;
}): Promise<void> {
  if (recipientIds.length === 0) return;

  const [ctx] = await sql<ConversationContext[]>`
    select
      c.recipient_type,
      coalesce(b.name, m.name) as identity_name,
      init.user_id as initiator_user_id,
      iu.name      as initiator_name,
      iu.username  as initiator_username
    from conversations c
    left join bands b on c.recipient_type = 'band' and b.id = c.recipient_id
    left join musicians m on c.recipient_type = 'musician' and m.id = c.recipient_id
    left join lateral (
      select user_id from conversation_participants
      where conversation_id = c.id order by created_at asc limit 1
    ) init on true
    left join users iu on iu.id = init.user_id
    where c.id = ${conversationId}
    limit 1
  `;
  if (!ctx) return;

  const recipients = await sql<
    { id: number; email: string; name: string | null; unsubscribe_token: string }[]
  >`
    select id, email, name, unsubscribe_token
    from users
    where id = any(${recipientIds}::bigint[])
      and notify_email_messages = true
      and email is not null
  `;
  if (recipients.length === 0) return;

  const base = (origin || FALLBACK_ORIGIN).replace(/\/$/, "");
  const threadUrl = `${base}/profile/messages/${conversationId}`;
  const identity = ctx.identity_name || (ctx.recipient_type === "band" ? "a band" : "a musician");
  const initiator =
    ctx.initiator_name ||
    (ctx.initiator_username ? `@${ctx.initiator_username}` : "Someone");

  await Promise.allSettled(
    recipients.map((r) => {
      // POV: the human who started the thread only ever hears from the
      // band/musician side; anyone on the recipient side hears from the human.
      const fromInitiator = r.id === ctx.initiator_user_id;
      const subject = fromInitiator
        ? `New message from ${identity}`
        : `New message for ${identity}`;
      const lead = fromInitiator
        ? `${identity} sent you a message on Twin Scene:`
        : `${initiator} sent ${identity} a message on Twin Scene:`;
      const unsubUrl = `${base}/unsubscribe/${r.unsubscribe_token}`;

      const text = `${lead}\n\n"${snippet}"\n\nRead and reply: ${threadUrl}\n\n—\nDon't want these? Unsubscribe: ${unsubUrl}`;
      const html =
        `<p>${escapeHtml(lead)}</p>` +
        `<blockquote style="margin:0 0 1em;padding:0 0 0 1em;border-left:3px solid #ccc;color:#444">${escapeHtml(snippet)}</blockquote>` +
        `<p><a href="${threadUrl}">Read and reply</a></p>` +
        `<hr style="border:none;border-top:1px solid #eee;margin:1.5em 0">` +
        `<p style="font-size:12px;color:#888">Don't want emails about new messages? <a href="${unsubUrl}">Unsubscribe</a>.</p>`;

      return sendEmail({ to: r.email, subject, html, text });
    }),
  );
}
