import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getCurrentUser } from "@/lib/auth";
import AccountMenu from "@/components/AccountMenu";
import "./globals.css";

// The app's typeface, exposed as the generic `--font-app` CSS variable so
// swapping fonts later is a one-line change here (globals.css reads the var).
// Bricolage Grotesque is variable, so we don't pin weights — the full range is
// available to the 400/500/600 the design uses.
const appFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-app",
});

export const metadata: Metadata = {
  title: "Twin Scene",
  description:
    "A curated index of the Twin Cities music scene, maintained by The Birdhaus.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${appFont.variable} h-full`}>
      <body className="min-h-full antialiased">
        <AccountMenu
          user={
            user
              ? { email: user.email, name: user.name, username: user.username, image_url: user.image_url }
              : null
          }
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
