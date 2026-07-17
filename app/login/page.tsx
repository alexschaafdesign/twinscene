import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Log in — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Log in to Twin Scene</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Enter your email and we&apos;ll send you a sign-in link. No password needed.
      </p>
      {sp.error === "1" && (
        <p className="mt-3 text-sm text-[#F5A3A3]">
          That link is invalid or has expired. Request a new one below.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
