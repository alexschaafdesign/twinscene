// Shared asset loaders for next/og ImageResponse routes (app/api/og/**).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Fetch one weight of Bricolage Grotesque as ttf/otf, matching the site's font. Never throws. */
export async function loadBricolageWeight(weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}`;
    const css = await (
      await fetch(cssUrl, {
        // A bare UA with no recognized browser tokens gets Google's most
        // conservative format (ttf) — modern UAs get woff2, which Satori can't parse.
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "force-cache",
      })
    ).text();
    const match = /src: url\(([^)]+)\) format\('(?:opentype|truetype|woff)'\)/.exec(css);
    if (!match) return null;
    const fontResponse = await fetch(match[1], { cache: "force-cache" });
    if (!fontResponse.ok) return null;
    return await fontResponse.arrayBuffer();
  } catch {
    return null;
  }
}

export async function loadLogoDataUri(): Promise<string | null> {
  try {
    const buffer = await readFile(join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
