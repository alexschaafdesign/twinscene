import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMediaProBySlug } from "@/lib/mediaPros";
import { getCurrentUser, canEditMediaPro, isAdmin } from "@/lib/auth";
import MediaProProfile from "@/components/MediaProProfile";
import ClaimMediaProButton from "@/components/ClaimMediaProButton";
import { mediaProEditHref } from "@/components/media-pro-shared";
import { iconProps } from "@/components/band-shared";

type Props = {
  params: Promise<{ slug: string }>;
};

// getMediaProBySlug() reads the DB directly (no fetch()), which gives Next
// no signal to render dynamically — without this a slug page (no
// generateStaticParams) gets cached after its first post-deploy render and
// goes stale on any later edit.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const mediaPro = await getMediaProBySlug(slug);
  if (!mediaPro) return {};

  const description =
    mediaPro.bio ||
    `${mediaPro.name}${mediaPro.city ? ` — ${mediaPro.city}` : ""} on Twin Scene, the Twin Cities music directory.`;

  return {
    title: mediaPro.name,
    description,
    openGraph: {
      title: mediaPro.name,
      description,
      type: "profile",
      images: mediaPro.photo ? [mediaPro.photo] : undefined,
    },
  };
}

export default async function MediaProProfilePage({ params }: Props) {
  const { slug } = await params;
  const mediaPro = await getMediaProBySlug(slug);
  if (!mediaPro) notFound();

  const user = await getCurrentUser();
  const canEdit = await canEditMediaPro(user, mediaPro.id);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-8 flex flex-wrap items-center justify-end gap-4">
        {canEdit ? (
          <>
            {isAdmin(user) && (
              <Link
                href={`/admin/media-pros/${mediaPro.slug}/editors`}
                className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
              >
                Manage editors
              </Link>
            )}
            <Link
              href={mediaProEditHref(mediaPro)}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
            >
              {/* ti-edit (Tabler) */}
              <svg {...iconProps} width={15} height={15}>
                <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
                <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" />
                <path d="M16 5l3 3" />
              </svg>
              <span className="md:hidden">Edit</span>
              <span className="hidden md:inline">Edit this listing</span>
            </Link>
          </>
        ) : (
          <ClaimMediaProButton slug={mediaPro.slug} loggedIn={!!user} />
        )}
      </div>

      <MediaProProfile mediaPro={mediaPro} />
    </main>
  );
}
