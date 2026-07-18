import type { Metadata } from "next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";

export const metadata: Metadata = {
  title: "Twin Scene Admin",
  robots: { index: false, follow: false },
};

// The shared shell for every /admin page. The nav is the "one dashboard" that
// ties the scraper tools and the user/claims management together — but it's
// only rendered for admins. Each page still enforces its own is_admin gate;
// hiding the nav from non-admins is presentation, not a permission check
// (docs/auth-and-db.md: never gate on hidden UI). The root layout already
// provides <html>/<body>, the font, and the dark background.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <>
      {isAdmin(user) && <AdminNav />}
      {children}
    </>
  );
}
