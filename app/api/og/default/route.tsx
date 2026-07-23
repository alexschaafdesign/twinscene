import { ImageResponse } from "next/og";
import { loadBricolageWeight, loadLogoDataUri } from "@/lib/ogAssets";

// fs access, so this needs the Node.js runtime, not Edge.
export const runtime = "nodejs";

// No params, always the same output — cache it instead of regenerating per
// request like the show/[id] card does.
export const revalidate = 86400;

const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = "#e8e0d0";
const RED = "#b42318";

export async function GET() {
  const [logoDataUri, boldFont, mediumFont] = await Promise.all([
    loadLogoDataUri(),
    loadBricolageWeight(800),
    loadBricolageWeight(500),
  ]);

  const fonts = [
    boldFont && { name: "Bricolage Grotesque", data: boldFont, weight: 800 as const, style: "normal" as const },
    mediumFont && { name: "Bricolage Grotesque", data: mediumFont, weight: 500 as const, style: "normal" as const },
  ].filter(
    (f): f is { name: string; data: ArrayBuffer; weight: 800 | 500; style: "normal" } => Boolean(f),
  );

  const fontFamily = fonts.length > 0 ? "Bricolage Grotesque" : "system-ui";

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
          fontFamily,
        }}
      >
        {logoDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUri} width={144} height={144} style={{ borderRadius: 30, marginBottom: 36 }} />
        )}
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: CREAM, letterSpacing: 6 }}>
          TWIN SCENE
        </div>
        <div style={{ display: "flex", marginTop: 22, width: 240, height: 8, backgroundColor: RED }} />
        <div
          style={{
            display: "flex",
            marginTop: 26,
            fontSize: 32,
            fontWeight: 500,
            color: CREAM,
            opacity: 0.7,
          }}
        >
          The Twin Cities music scene, all in one place
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
