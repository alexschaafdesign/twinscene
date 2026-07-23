import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWriterBySlug } from "@/lib/writers";
import { listArticlesByWriter } from "@/lib/articles";
import { getCurrentUser, canEditWriter, isAdmin } from "@/lib/auth";
import { WriterAvatar, ensureUrl } from "@/components/writer-shared";
import { ArticleCard } from "@/components/article-cards";
import ClaimWriterButton from "@/components/ClaimWriterButton";
import BackLink from "@/components/BackLink";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const writer = await getWriterBySlug(slug);
  if (!writer) return {};
  const description =
    writer.bio ||
    `${writer.name}${writer.publication ? ` — ${writer.publication}` : ""} on Twin Scene.`;
  return pageMetadata({ title: writer.name, description, image: writer.photo, type: "profile" });
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-[#E8E0D0]/25 px-3 py-1 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
    >
      {label}
    </a>
  );
}

export default async function WriterProfilePage({ params }: Props) {
  const { slug } = await params;
  const writer = await getWriterBySlug(slug);
  if (!writer) notFound();

  const user = await getCurrentUser();
  const canEdit = await canEditWriter(user, writer.id);
  const articles = await listArticlesByWriter(writer.id, { includeDrafts: canEdit });

  const instagramHandle = writer.instagram?.replace(/^@/, "").trim();
  const twitterHandle = writer.twitter?.replace(/^@/, "").trim();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/writers" label="Writers" className="mb-6" />

      <header className="flex flex-col gap-5 border-b border-[#E8E0D0]/15 pb-8 sm:flex-row sm:items-start sm:gap-6">
        <WriterAvatar writer={writer} className="h-20 w-20 shrink-0 text-2xl sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div>
              <h1 className="text-3xl font-semibold leading-tight text-[#E8E0D0] sm:text-4xl">
                {writer.name}
              </h1>
              {(writer.publication || writer.city) && (
                <p className="mt-1 text-sm text-[#E8E0D0]/60">
                  {[writer.publication, writer.city].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canEdit ? (
                <>
                  {isAdmin(user) && (
                    <Link
                      href={`/admin/writers/${writer.slug}/editors`}
                      className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
                    >
                      Manage editors
                    </Link>
                  )}
                  <Link
                    href={`/admin/writers/${writer.slug}/edit`}
                    className="text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
                  >
                    Edit profile
                  </Link>
                </>
              ) : (
                <ClaimWriterButton slug={writer.slug} loggedIn={!!user} />
              )}
            </div>
          </div>

          {writer.bio && (
            <p className="mt-4 whitespace-pre-line break-words text-[15px] leading-relaxed text-[#E8E0D0]/85">
              {writer.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {writer.publication && writer.website && (
              <LinkPill href={ensureUrl(writer.website)} label={writer.publication} />
            )}
            {writer.website && !writer.publication && (
              <LinkPill href={ensureUrl(writer.website)} label="Website" />
            )}
            {writer.substack_url && <LinkPill href={ensureUrl(writer.substack_url)} label="Substack" />}
            {instagramHandle && (
              <LinkPill href={`https://instagram.com/${instagramHandle}`} label="Instagram" />
            )}
            {twitterHandle && <LinkPill href={`https://x.com/${twitterHandle}`} label="X" />}
          </div>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-6 font-mono text-xs uppercase tracking-wider text-[#E8E0D0]/50">
          {articles.length} {articles.length === 1 ? "piece" : "pieces"}
        </h2>
        {articles.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">No pieces yet.</p>
        ) : (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} showByline={false} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
