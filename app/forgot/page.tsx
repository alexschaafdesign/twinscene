import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password — Twin Scene",
  robots: { index: false, follow: false },
};

// "Forgot password" entry point. Also the way an existing magic-link account
// adopts a password for the first time — the reset flow sets password_hash.
export default function ForgotPasswordPage() {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Reset your password</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Enter your email and we&apos;ll send a link to set a new password. This also works to set
        a password for the first time if you&apos;ve only ever used email links.
      </p>
      <ForgotPasswordForm isDev={isDev} />
    </main>
  );
}
