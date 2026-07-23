import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { upsertArticle, deleteArticle, getArticleById } from "@/lib/articles";
import { buildArticleInput, type ArticleBody } from "@/lib/articleFormInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await getArticleById(id))) {
    return NextResponse.json({ success: false, error: "Article not found" }, { status: 404 });
  }

  const body = (await request.json()) as ArticleBody;
  const input = await buildArticleInput(body);
  if ("error" in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const article = await upsertArticle(input, id);
  return NextResponse.json({ success: true, article });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: "Bad id" }, { status: 400 });
  }

  await deleteArticle(id);
  return NextResponse.json({ success: true });
}
