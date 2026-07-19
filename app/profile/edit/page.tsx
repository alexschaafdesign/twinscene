import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ProfileEditForm from "@/components/ProfileEditForm";

export const metadata: Metadata = {
  title: "Edit profile — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile/edit");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Edit profile</h1>
      <ProfileEditForm
        user={{
          name: user.name,
          username: user.username,
          bio: user.bio,
          image_url: user.image_url,
          profile_public: user.profile_public,
        }}
      />
    </main>
  );
}
