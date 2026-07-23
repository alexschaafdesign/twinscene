import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { upsertArticle } from "@/lib/articles";
import { buildArticleInput, type ArticleBody } from "@/lib/articleFormInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a new article (admin curation, v1). Band cross-links resolve from the
// form's comma-separated band slugs — see lib/articleFormInput.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as ArticleBody;
  const input = await buildArticleInput(body);
  if ("error" in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const article = await upsertArticle(input);
  return NextResponse.json({ success: true, article });
}
