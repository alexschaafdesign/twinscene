import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getAllWritersWithCounts } from "@/lib/writers";

export const metadata: Metadata = {
  title: "Writers — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminWritersPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const writers = await getAllWritersWithCounts();

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-medium">Writers</h1>
        <Link
          href="/admin/writers/new"
          className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
        >
          + New writer
        </Link>
      </div>

      {writers.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No writers yet.</p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10">
          {writers.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link href={`/writers/${w.slug}`} className="font-medium hover:underline">
                  {w.name}
                </Link>
                <div className="text-xs text-[#E8E0D0]/50">
                  {[w.publication, `${w.article_count} pieces`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/admin/writers/${w.slug}/edit`}
                  className="text-[#E8E0D0]/70 hover:text-[#E8E0D0]"
                >
                  Edit
                </Link>
                <Link
                  href={`/admin/writers/${w.slug}/editors`}
                  className="text-[#E8E0D0]/70 hover:text-[#E8E0D0]"
                >
                  Editors
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
