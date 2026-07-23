import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getArticleById, getArticleBandSlugs } from "@/lib/articles";
import { getAllWriters } from "@/lib/writers";
import { getAllBands } from "@/lib/bands";
import ArticleForm from "@/components/ArticleForm";

export const metadata: Metadata = {
  title: "Edit article — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// yyyy-mm-dd for the <input type="date">, from a timestamptz.
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const id = Number((await params).id);
  const article = Number.isInteger(id) ? await getArticleById(id) : null;
  if (!article) notFound();

  const [writers, bands, bandSlugs] = await Promise.all([
    getAllWriters(),
    getAllBands(),
    getArticleBandSlugs(article.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">Edit article</h1>
      <ArticleForm
        mode="edit"
        writers={writers.map((w) => ({ id: w.id, name: w.name }))}
        bands={bands.map((b) => ({ name: b.name, slug: b.slug }))}
        initial={{
          id: article.id,
          writerId: article.writer_id,
          url: article.url,
          title: article.title,
          publication: article.publication ?? "",
          dek: article.dek ?? "",
          pullQuote: article.pull_quote ?? "",
          heroImageUrl: article.hero_image_url ?? "",
          publishedAt: toDateInput(article.published_at),
          readingTime: article.reading_time?.toString() ?? "",
          featured: article.featured,
          status: article.status,
          bandSlugs: bandSlugs,
        }}
      />
    </main>
  );
}
