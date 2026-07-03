import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TCMS Admin",
  robots: { index: false, follow: false },
};

// No nav or chrome — just the page content. The root layout already provides
// <html>/<body>, the font, and the dark background.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
