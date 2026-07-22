import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getConversation,
  canViewConversation,
  getThreadForUser,
} from "@/lib/messaging";
import { blockUser, unblockUser } from "@/lib/messageBlocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Block or unblock the human who started this conversation. Only the RECIPIENT
// side may do this — a band's editors, or the musician's linked user — never the
// initiator (you can't block the band you messaged). We reuse getThreadForUser's
// role resolution: replyAs.kind === "identity" means the caller is on the
// recipient side; "self" means they're the initiator (403). The blocked user is
// always the thread's initiator; the block is owned by the recipient identity.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in" }, { status: 401 });
  }

  const conversation = await getConversation(conversationId);
  if (!conversation || !(await canViewConversation(user, conversation))) {
    // Same 404 as a missing thread — don't leak existence to non-viewers.
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  if (action !== "block" && action !== "unblock") {
    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  }

  const thread = await getThreadForUser(conversation, user);
  if (thread.replyAs.kind !== "identity") {
    // The initiator can't block the identity they reached out to.
    return NextResponse.json(
      { success: false, error: "Only the recipient can block a sender" },
      { status: 403 },
    );
  }
  if (!thread.initiator) {
    return NextResponse.json({ success: false, error: "No one to block" }, { status: 400 });
  }

  const identity = { blockerType: conversation.recipient_type, blockerId: conversation.recipient_id };
  if (action === "block") {
    await blockUser({ ...identity, blockedUserId: thread.initiator.id, byUserId: user.id });
  } else {
    await unblockUser({ ...identity, blockedUserId: thread.initiator.id });
  }

  return NextResponse.json({ success: true, blocked: action === "block" });
}
