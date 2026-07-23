import type { Metadata } from "next";

export const SITE_URL = "https://twinscene.org";
export const SITE_NAME = "Twin Scene";

// Branded fallback card (see app/api/og/default/route.tsx) — used whenever a
// page has no entity image of its own, so a shared link never falls back to
// a bare favicon/generic card.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/api/og/default`;

function absoluteImage(image?: string | null): string {
  return image && /^https?:\/\//i.test(image) ? image : DEFAULT_OG_IMAGE;
}

/**
 * Builds a consistent title + description + openGraph + twitter block.
 * Next.js metadata merges `openGraph`/`twitter` shallowly per route segment —
 * a page that sets `openGraph` at all replaces the parent's whole object, it
 * doesn't inherit missing fields like `images`. So every page needs its own
 * complete block rather than relying on the root layout's defaults.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  image?: string | null;
  type?: "website" | "profile" | "article";
}): Metadata {
  const { title, description, image, type = "website" } = opts;
  const resolvedImage = absoluteImage(image);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type,
      siteName: SITE_NAME,
      images: [{ url: resolvedImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [resolvedImage],
    },
  };
}
