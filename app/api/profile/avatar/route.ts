import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setAvatar } from "@/lib/users";
import { generateAvatar, uploadAvatar, deleteAvatar } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Logged-in user uploading their own avatar. The photo is never stored as
// uploaded — sharp re-encodes it to a fixed-size square WebP (lib/r2's
// generateAvatar), which both normalizes the format and strips EXIF/other
// metadata, and the result lands under a server-chosen
// avatars/<userId>/<random>.webp key, never a path the client supplies.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to update your avatar" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: "No image provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: "Image must be 5MB or smaller" }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resized = await generateAvatar(bytes);
    const imageUrl = await uploadAvatar(user.id, resized);

    await setAvatar(user.id, imageUrl);

    if (user.image_url) {
      await deleteAvatar(user.image_url);
    }

    return NextResponse.json({ success: true, image_url: imageUrl });
  } catch (err) {
    console.error("profile/avatar: upload failed", err);
    return NextResponse.json({ success: false, error: "Couldn't process that image" }, { status: 500 });
  }
}
