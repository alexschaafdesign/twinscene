import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canEditMusician } from "@/lib/musicians";
import { getOrCreateConversation, sendMessage, type RecipientType } from "@/lib/messaging";
import { allowMessageSend } from "@/lib/messageRateLimit";
import { isBlocked } from "@/lib/messageBlocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start (or continue) a conversation with a band or musician and post the first
// message. Guarded by a per-sender rate limit and per-identity blocking
// (slice 4); reporting/moderation is still a later slice.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to send a message" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const recipientType = payload?.recipientType as RecipientType | undefined;
  const recipientId = Number(payload?.recipientId);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (recipientType !== "band" && recipientType !== "musician") {
    return NextResponse.json({ success: false, error: "Invalid recipient" }, { status: 400 });
  }
  if (!Number.isInteger(recipientId) || recipientId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid recipient" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ success: false, error: "Message can't be empty" }, { status: 400 });
  }

  // Rate limit before doing any work — counts even rejected-below attempts, so
  // hammering the endpoint keeps tripping the cap rather than resetting it.
  if (!(await allowMessageSend(user.id))) {
    return NextResponse.json(
      { success: false, error: "You're sending messages too fast. Try again in a few minutes." },
      { status: 429 },
    );
  }

  // Confirm the recipient actually exists (avoid dangling conversations).
  const [exists] =
    recipientType === "band"
      ? await sql`select 1 from bands where id = ${recipientId} limit 1`
      : await sql`select 1 from musicians where id = ${recipientId} limit 1`;
  if (!exists) {
    return NextResponse.json({ success: false, error: "Recipient not found" }, { status: 404 });
  }

  // You can't message an identity you already hold — that inbox is yours; the
  // reply flow, not a new conversation, is how you'd speak as it. (The UI hides
  // the button in this case; this is the server-side backstop.)
  const holdsIdentity =
    recipientType === "band"
      ? await canEditBand(user, recipientId)
      : await canEditMusician(user, recipientId);
  if (holdsIdentity) {
    return NextResponse.json(
      { success: false, error: "You can't message a profile you manage" },
      { status: 400 },
    );
  }

  // Blocked by this identity → can't start or continue a conversation with it.
  if (await isBlocked(recipientType, recipientId, user.id)) {
    return NextResponse.json(
      { success: false, error: "This profile isn't accepting messages from you." },
      { status: 403 },
    );
  }

  const conversation = await getOrCreateConversation({
    initiatorUserId: user.id,
    recipientType,
    recipientId,
  });

  // The initiator always speaks as themselves (sender_as_type null).
  await sendMessage({
    conversationId: conversation.id,
    sender: user,
    body,
    origin: request.nextUrl.origin,
  });

  return NextResponse.json({ success: true, conversationId: conversation.id });
}
