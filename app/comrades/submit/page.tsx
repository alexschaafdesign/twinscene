import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ComradeSubmitForm from "@/components/ComradeSubmitForm";
import { getComradeBySlug } from "@/lib/comrades";
import { getCurrentUser, canEditComrade } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Add a comrade — Twin Scene",
  description: "List a studio, label, or other fixture of the Twin Cities music scene.",
};

export const dynamic = "force-dynamic";

export default async function ComradeSubmitPage({
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
    const comrade = slug ? await getComradeBySlug(slug) : null;
    if (!comrade) notFound();
    const user = await getCurrentUser();
    if (!(await canEditComrade(user, comrade.id))) {
      return (
        <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
          <p className="text-sm text-[#F5A3A3]">
            {user
              ? "You don't have edit access to this listing."
              : "Log in to edit this listing."}
          </p>
        </main>
      );
    }
    initialPhotoUrl = comrade.photo ?? "";
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <ComradeSubmitForm
        mode={isCorrect ? "correct" : "add"}
        initialSlug={slug}
        initialName={param("name")}
        initialCategory={param("category")}
        initialTagline={param("tagline")}
        initialCity={param("city")}
        initialBio={param("bio")}
        initialWebsite={param("website")}
        initialInstagram={param("instagram")}
        initialContact={param("contact")}
        initialPhotoUrl={initialPhotoUrl}
      />
    </main>
  );
}
