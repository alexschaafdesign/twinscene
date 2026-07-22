import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, type User } from "@/lib/auth";
import {
  getConversation,
  canViewConversation,
  getThreadForUser,
  sendMessage,
  markConversationRead,
  type Conversation,
} from "@/lib/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET the thread (and mark it read for the viewer). POST a reply. Both gate on
// canViewConversation: the initiator, or anyone holding the recipient identity
// (any band editor / the linked musician). A user who is neither gets 404 —
// same response as a nonexistent id, so thread existence isn't leaked.
type Viewable =
  | { error: NextResponse; user?: undefined; conversation?: undefined }
  | { error?: undefined; user: User; conversation: Conversation };

async function loadViewable(conversationId: string): Promise<Viewable> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ success: false, error: "Log in" }, { status: 401 }) };

  const conversation = await getConversation(conversationId);
  if (!conversation || !(await canViewConversation(user, conversation))) {
    return { error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
  }
  return { user, conversation };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const { user, conversation, error } = await loadViewable(conversationId);
  if (error) return error;

  const thread = await getThreadForUser(conversation, user);
  await markConversationRead({ conversationId, userId: user.id });
  return NextResponse.json({ success: true, thread });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const { user, conversation, error } = await loadViewable(conversationId);
  if (error) return error;

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ success: false, error: "Message can't be empty" }, { status: 400 });
  }

  // How this viewer speaks: the initiator replies as themselves; anyone on the
  // recipient side replies AS the band/musician. getThreadForUser resolves the
  // role (initiator wins if the viewer is somehow both).
  const { replyAs } = await getThreadForUser(conversation, user);
  const origin = request.nextUrl.origin;
  const message =
    replyAs.kind === "identity"
      ? await sendMessage({
          conversationId,
          sender: user,
          senderAsType: replyAs.type,
          senderAsId: replyAs.id,
          body,
          origin,
        })
      : await sendMessage({ conversationId, sender: user, body, origin });

  // Sending is implicitly reading — stamp the sender's read marker.
  await markConversationRead({ conversationId, userId: user.id });

  return NextResponse.json({ success: true, message });
}
