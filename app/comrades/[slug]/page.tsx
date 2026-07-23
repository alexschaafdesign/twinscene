import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getComradeBySlug } from "@/lib/comrades";
import { getCurrentUser, canEditComrade, isAdmin } from "@/lib/auth";
import ComradeProfile from "@/components/ComradeProfile";
import ClaimComradeButton from "@/components/ClaimComradeButton";
import { comradeEditHref } from "@/components/comrade-shared";
import { iconProps } from "@/components/band-shared";
import BackLink from "@/components/BackLink";
import { pageMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

// getComradeBySlug() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this a slug page (no
// generateStaticParams) gets cached after its first post-deploy render and
// goes stale on any later edit.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) return {};

  const description =
    comrade.tagline ||
    comrade.bio ||
    `${comrade.name}${comrade.city ? ` — ${comrade.city}` : ""} on Twin Scene, the Twin Cities music directory.`;

  return pageMetadata({ title: comrade.name, description, image: comrade.photo, type: "profile" });
}

export default async function ComradeProfilePage({ params }: Props) {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) notFound();

  const user = await getCurrentUser();
  const canEdit = await canEditComrade(user, comrade.id);

  const actions = canEdit ? (
    <>
      {isAdmin(user) && (
        <Link
          href={`/admin/comrades/${comrade.slug}/editors`}
          className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
        >
          Manage editors
        </Link>
      )}
      <Link
        href={comradeEditHref(comrade)}
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
    <ClaimComradeButton slug={comrade.slug} loggedIn={!!user} />
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/comrades" label="Comrades" className="mb-6" />
      <ComradeProfile comrade={comrade} actions={actions} />
    </main>
  );
}
