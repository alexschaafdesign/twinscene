import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canEditMusician } from "@/lib/musicians";
import { getOrCreateConversation, sendMessage, type RecipientType } from "@/lib/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start (or continue) a conversation with a band or musician and post the first
// message. Any signed-in user may message any band/musician — there is NO
// blocking / rate-limiting / reporting yet. KNOWN GAP: revisit before any public
// push that would drive strangers to message bands at volume.
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

  const conversation = await getOrCreateConversation({
    initiatorUserId: user.id,
    recipientType,
    recipientId,
  });

  // The initiator always speaks as themselves (sender_as_type null).
  await sendMessage({ conversationId: conversation.id, sender: user, body });

  return NextResponse.json({ success: true, conversationId: conversation.id });
}
