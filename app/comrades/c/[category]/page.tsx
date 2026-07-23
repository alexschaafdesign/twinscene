import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getComradesByCategory } from "@/lib/comrades";
import { categoryFromSlug, comradeCategoryLabel } from "@/lib/comradeUtils";
import { pageMetadata } from "@/lib/metadata";
import ComradeGrid from "@/components/ComradeGrid";
import BackLink from "@/components/BackLink";

type Props = {
  params: Promise<{ category: string }>;
};

// getComradesByCategory() reads the DB directly (no fetch()), which gives Next
// no signal to render dynamically — without this the page gets cached after its
// first post-deploy render and goes stale on any later edit. Same note as
// /comrades.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return {};

  const label = comradeCategoryLabel(category);
  return pageMetadata({
    title: `${label} — Comrades`,
    description: `${label} in the Twin Cities music scene, listed on Twin Scene.`,
  });
}

export default async function ComradeCategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const comrades = await getComradesByCategory(category);
  const label = comradeCategoryLabel(category);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/comrades" label="All Comrades" className="mb-6" />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">{label}</h1>
        <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
          {label} in the Twin Cities music scene.
        </p>
      </header>

      <ComradeGrid
        comrades={comrades}
        fixedCategory={category}
        intro={
          <Link
            href="/comrades/submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            + Add a comrade
          </Link>
        }
      />
    </main>
  );
}
