import type { Metadata } from "next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import WriterForm from "@/components/WriterForm";

export const metadata: Metadata = {
  title: "New writer — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewWriterPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">New writer</h1>
      <WriterForm mode="add" />
    </main>
  );
}
