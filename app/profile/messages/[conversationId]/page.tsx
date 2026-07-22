import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getConversation,
  canViewConversation,
  getThreadForUser,
  markConversationRead,
} from "@/lib/messaging";
import BackLink from "@/components/BackLink";
import MessageReplyForm from "@/components/MessageReplyForm";

export const metadata: Metadata = {
  title: "Message — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conversationId: string }> };

// Rendered server-side (Vercel runs in UTC), so pin the scene's timezone —
// otherwise an 11:12am Central message reads as "4:12pm". America/Chicago is
// the app-wide convention (see lib/fetchShows todayInChicago).
function timestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export default async function ThreadPage({ params }: Props) {
  const { conversationId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/profile/messages/${conversationId}`);
  }

  const conversation = await getConversation(conversationId);
  // 404 (not 403) for both a missing thread and one this user may not see —
  // don't leak thread existence.
  if (!conversation || !(await canViewConversation(user, conversation))) {
    notFound();
  }

  const thread = await getThreadForUser(conversation, user);

  // Opening the thread marks it read for THIS user only (per-person tracking).
  await markConversationRead({ conversationId, userId: user.id });

  const viewerSide = thread.replyAs.kind === "identity" ? "recipient" : "initiator";

  // Plain identity name for the reply attribution ("as Yellow Ostrich").
  const identityName =
    conversation.recipient_type === "band"
      ? thread.tag
      : thread.tag.replace(/^Musician:\s*/, "");
  const sendingAsLabel =
    thread.replyAs.kind === "identity" ? `as ${identityName}` : "as yourself";

  // The other party's display name, from the viewer's POV.
  const initiatorName =
    thread.initiator?.name ||
    (thread.initiator?.username ? `@${thread.initiator.username}` : "Someone");
  const headerWith = viewerSide === "recipient" ? initiatorName : thread.tag;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <BackLink href="/profile/messages" label="Messages" />

      <div>
        <h1 className="text-xl font-medium">{headerWith}</h1>
        {viewerSide === "recipient" && (
          <p className="mt-1 text-sm text-[#E8E0D0]/50">
            Sent to <span className="text-[#E8E0D0]/75">{thread.tag}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {thread.messages.map((m) => {
          const messageSide = m.sender_as_type ? "recipient" : "initiator";
          const mine = messageSide === viewerSide;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                  mine
                    ? "bg-[#E8E0D0] text-[#2A2420]"
                    : "border border-[#E8E0D0]/20 bg-[#E8E0D0]/5 text-[#E8E0D0]"
                }`}
              >
                {m.body}
              </div>
              <span className="mt-1 px-1 text-[11px] text-[#E8E0D0]/35">
                {timestamp(m.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      <MessageReplyForm conversationId={conversationId} sendingAsLabel={sendingAsLabel} />
    </main>
  );
}
