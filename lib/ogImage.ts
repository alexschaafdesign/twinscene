// Best-effort fetch of a page's preview image (og:image / twitter:image), for
// the "Featured links" cards on a band profile. TS port of extractOgImage_ in
// apps-script/Code.js — keep the regexes in sync if that changes.
//
// Returns "" on any failure (many sites block bots or need JS to render the
// meta tags) — a blank image must never fail the surrounding band submission.

import { decodeHtmlEntities } from "./bandcamp";

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
];

export async function extractOgImage(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";

  try {
    const res = await fetch(trimmed, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TwinSceneBot/1.0; +https://twinscene.org)",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();

    let raw: string | undefined;
    for (const pattern of OG_IMAGE_PATTERNS) {
      raw = html.match(pattern)?.[1];
      if (raw) break;
    }
    if (!raw) return "";

    const img = decodeHtmlEntities(raw).trim();
    if (!img) return "";
    if (img.startsWith("//")) return `https:${img}`;
    if (img.startsWith("/")) {
      const origin = trimmed.match(/^(https?:\/\/[^/]+)/i)?.[1];
      return origin ? origin + img : img;
    }
    return img;
  } catch {
    return "";
  }
}
