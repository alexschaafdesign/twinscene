import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getAllWriters } from "@/lib/writers";
import ArticleForm from "@/components/ArticleForm";

export const metadata: Metadata = {
  title: "New article — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const writers = await getAllWriters();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">New article</h1>
      {writers.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/60">
          Add a{" "}
          <Link href="/admin/writers/new" className="underline hover:text-[#E8E0D0]">
            writer
          </Link>{" "}
          first — an article needs one.
        </p>
      ) : (
        <ArticleForm mode="add" writers={writers.map((w) => ({ id: w.id, name: w.name }))} />
      )}
    </main>
  );
}
