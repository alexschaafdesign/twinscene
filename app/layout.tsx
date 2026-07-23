import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import { pageMetadata, SITE_URL } from "@/lib/metadata";
import AccountMenu from "@/components/AccountMenu";
import SectionNav from "@/components/SectionNav";
import "./globals.css";

// The app's typeface, exposed as the generic `--font-app` CSS variable so
// swapping fonts later is a one-line change here (globals.css reads the var).
// Bricolage Grotesque is variable, so we don't pin weights — the full range is
// available to the 400/500/600 the design uses.
const appFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-app",
});

// Used just for the "TWIN SCENE" header wordmark — a mono typeface next to
// the round logo mark gives it a bit of a stamped/lockup feel.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  // Lets every URL-based metadata field below (and in child routes) use a
  // relative path instead of requiring a fully-qualified URL.
  metadataBase: new URL(SITE_URL),
  ...pageMetadata({
    title: "Twin Scene",
    description:
      "A curated index of the Twin Cities music scene, maintained by The Birdhaus.",
  }),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const notificationsUnread = user ? await getUnreadCount(user.id) : 0;
  return (
    <html lang="en" className={`${appFont.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <AccountMenu
          user={
            user
              ? { email: user.email, name: user.name, username: user.username, image_url: user.image_url }
              : null
          }
          notificationsUnread={notificationsUnread}
          isAdmin={isAdmin(user)}
        />
        <SectionNav />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
