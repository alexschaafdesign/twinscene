import Link from "next/link";
import type { Metadata } from "next";
import { getAllWritersWithCounts } from "@/lib/writers";
import { WriterAvatar } from "@/components/writer-shared";

export const metadata: Metadata = {
  title: "Writers — Twin Scene",
  description:
    "Music writers, journalists, and bloggers covering the Twin Cities scene.",
};

// getAllWritersWithCounts() reads the DB directly (no fetch()), so Next has no
// signal to render dynamically — same note as /photo-video.
export const dynamic = "force-dynamic";

export default async function WritersPage() {
  const writers = await getAllWritersWithCounts();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Writers</h1>
          <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
            The people covering the Twin Cities scene. Read their work over on{" "}
            <Link href="/reads" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Reads
            </Link>
            .
          </p>
        </div>
      </header>

      {writers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E8E0D0]/20 px-6 py-16 text-center text-[#E8E0D0]/50">
          No writers yet.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {writers.map((writer) => (
            <li key={writer.id}>
              <Link
                href={`/writers/${writer.slug}`}
                className="flex h-full gap-4 rounded-lg border border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/[0.06]"
              >
                <WriterAvatar writer={writer} className="h-14 w-14 shrink-0 text-lg" />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#E8E0D0]">{writer.name}</div>
                  {writer.publication && (
                    <div className="truncate text-sm text-[#E8E0D0]/60">{writer.publication}</div>
                  )}
                  {writer.bio && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#E8E0D0]/55">
                      {writer.bio}
                    </p>
                  )}
                  <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-[#E8E0D0]/40">
                    {writer.article_count} {writer.article_count === 1 ? "piece" : "pieces"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
