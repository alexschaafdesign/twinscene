import type { Metadata } from "next";
import AuthPanel from "@/components/AuthPanel";

export const metadata: Metadata = {
  title: "Sign in — Twin Scene",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Sign in or create your account</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Sign in with your email and password, or switch to a one-time email link — no password needed.
      </p>
      {sp.error === "1" && (
        <p className="mt-3 text-sm text-[#F5A3A3]">
          That link is invalid or has expired. Request a new one below.
        </p>
      )}
      {sp.verify === "expired" && (
        <p className="mt-3 text-sm text-[#F5A3A3]">
          That verification link is invalid or has expired. Sign in to get a new one sent.
        </p>
      )}
      <AuthPanel next={next} isDev={isDev} />
    </main>
  );
}
