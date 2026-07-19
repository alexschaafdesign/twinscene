import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MediaProSubmitForm from "@/components/MediaProSubmitForm";
import { getMediaProBySlug } from "@/lib/mediaPros";
import { getCurrentUser, canEditMediaPro } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Add yourself — Twin Scene",
  description: "List yourself as a photographer/videographer in the Twin Cities music scene directory.",
};

export const dynamic = "force-dynamic";

export default async function MediaProSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const isCorrect = sp.correct === "true";
  const param = (key: string): string => {
    const v = sp[key];
    return typeof v === "string" ? v : "";
  };

  const slug = param("slug");

  let initialPhotoUrl = "";
  if (isCorrect) {
    const mediaPro = slug ? await getMediaProBySlug(slug) : null;
    if (!mediaPro) notFound();
    const user = await getCurrentUser();
    if (!(await canEditMediaPro(user, mediaPro.id))) {
      return (
        <main className="mx-auto w-full max-w-2xl px-5 py-24 text-[#E8E0D0] sm:px-8">
          <p className="text-sm text-[#F5A3A3]">
            {user
              ? "You don't have edit access to this listing."
              : "Log in to edit this listing."}
          </p>
        </main>
      );
    }
    initialPhotoUrl = mediaPro.photo ?? "";
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <MediaProSubmitForm
        mode={isCorrect ? "correct" : "add"}
        initialSlug={slug}
        initialName={param("name")}
        initialRole={param("role")}
        initialCity={param("city")}
        initialBio={param("bio")}
        initialWebsite={param("website")}
        initialInstagram={param("instagram")}
        initialContact={param("contact")}
        initialPortfolioUrl={param("portfolioUrl")}
        initialPhotoUrl={initialPhotoUrl}
      />
    </main>
  );
}
