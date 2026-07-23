import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listAllArticles } from "@/lib/articles";
import DeleteArticleButton from "@/components/DeleteArticleButton";

export const metadata: Metadata = {
  title: "Reads — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminArticlesPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const articles = await listAllArticles();

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-medium">Reads — articles</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/writers" className="text-sm text-[#E8E0D0]/70 hover:text-[#E8E0D0]">
            Writers →
          </Link>
          <Link
            href="/admin/articles/new"
            className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
          >
            + New article
          </Link>
        </div>
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">
          No articles yet. Add writers first, then create an article.
        </p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10">
          {articles.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.title}</span>
                  {a.featured && (
                    <span className="rounded bg-[#7c5e35]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#E8E0D0]/80">
                      Featured
                    </span>
                  )}
                  {a.status === "draft" && (
                    <span className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#E8E0D0]/60">
                      Draft
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-[#E8E0D0]/50">
                  {[a.writer_name, a.publication].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/admin/articles/${a.id}/edit`}
                  className="text-[#E8E0D0]/70 hover:text-[#E8E0D0]"
                >
                  Edit
                </Link>
                <DeleteArticleButton id={a.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
