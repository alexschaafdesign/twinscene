import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCachedShowById } from "@/lib/cachedReads";
import { isVenueLogo } from "@/lib/venueImages";

// fs + Postgres access, so this needs the Node.js runtime, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1080;
const HEIGHT = 1920;

const CREAM = "#e8e0d0";
const RED = "#b42318";

/** "YYYY-MM-DD" -> "MONDAY, JULY 13". Parsed as UTC to dodge local TZ shift, like ShowsTimeline. */
function formatDateLabel(date: string): string {
  const [y, mo, d] = date.split("-");
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(dt)
    .toUpperCase();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Split the lineup ("A, B, C") into individual acts so the card can stack them
 * as a poster-style bill instead of one run-on line.
 */
function lineupActs(lineup: string): string[] {
  return lineup
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fetch one weight of Bricolage Grotesque as ttf/otf/woff, matching the site's font. Never throws. */
async function loadFontWeight(weight: number): Promise<ArrayBuffer | null> {
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

async function loadLogoDataUri(): Promise<string | null> {
  try {
    const buffer = await readFile(join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Fetch a scraped flyer (an external URL) into a data URI so ImageResponse
 * doesn't have to reach out mid-render. Bounded by a short timeout and returns
 * null on any failure (bad URL, 403, non-image, timeout) so the card falls back
 * to the plain text layout instead of erroring.
 */
async function loadFlyerDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000),
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// Maps the ?status= param to the chip label shown on the card. Mirrors the
// attendance states in lib/showSaves.ts (ShowStatus).
const STATUS_LABELS: Record<string, string> = {
  interested: "INTERESTED",
  going: "GOING",
  went: "I WAS THERE",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const show = await getCachedShowById(id);

  if (!show) {
    return new Response("Not found", { status: 404 });
  }

  const statusLabel = STATUS_LABELS[new URL(req.url).searchParams.get("status") ?? ""] ?? null;

  // Use the scraped flyer only when it's a real poster — venue-logo fallbacks
  // (isVenueLogo) look wrong stretched full-bleed, so those get the text card.
  const flyerUrl = show.flyerUrl && !isVenueLogo(show.flyerUrl) ? show.flyerUrl : null;

  const [logoDataUri, boldFont, mediumFont, flyerDataUri] = await Promise.all([
    loadLogoDataUri(),
    loadFontWeight(800),
    loadFontWeight(500),
    flyerUrl ? loadFlyerDataUri(flyerUrl) : Promise.resolve(null),
  ]);

  const fonts = [
    boldFont && { name: "Bricolage Grotesque", data: boldFont, weight: 800 as const, style: "normal" as const },
    mediumFont && { name: "Bricolage Grotesque", data: mediumFont, weight: 500 as const, style: "normal" as const },
  ].filter(
    (f): f is { name: string; data: ArrayBuffer; weight: 800 | 500; style: "normal" } => Boolean(f),
  );

  const fontFamily = fonts.length > 0 ? "Bricolage Grotesque" : "system-ui";

  // "Interested" (etc.) pill — green to match the active attendance button in
  // components/ShowStatusButtons.tsx. Rendered in the header of whichever card
  // is chosen, only when a valid ?status= is passed.
  const GREEN = "#8FD693";
  const statusChip = statusLabel ? (
    <div
      style={{
        display: "flex",
        marginTop: 22,
        paddingLeft: 26,
        paddingRight: 26,
        paddingTop: 10,
        paddingBottom: 12,
        borderRadius: 999,
        border: `3px solid ${GREEN}`,
        backgroundColor: "rgba(143,214,147,0.14)",
        fontSize: 30,
        fontWeight: 800,
        color: GREEN,
        letterSpacing: 2,
        alignItems: "center",
      }}
    >
      <div style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: GREEN, marginRight: 14 }} />
      {statusLabel}
    </div>
  ) : null;

  const dateLabel = formatDateLabel(show.date);
  const acts = lineupActs(show.lineup);
  // The headliner is either an explicit title or the first act on the bill.
  const headliner = show.title || acts[0] || show.venue;
  // Everything else on the bill, minus any act that just restates the headliner
  // (scraped rows often set title === first lineup act).
  const support = acts.filter((act) => act.toLowerCase() !== headliner.toLowerCase());

  // Scale the headliner down as it gets longer so it never overflows the width.
  const headlineSize = headliner.length > 24 ? 88 : headliner.length > 16 ? 108 : 132;

  const timeLabel = show.musicTime || show.doorsTime || "";

  // Flyer-forward card: the whole poster/photo is framed (objectFit contain) on
  // the black Twin Scene background, with a fixed header and footer above and
  // below it. Containing rather than cropping means a text-heavy gig poster
  // stays fully legible and our chrome never lands on top of the poster's own
  // text — the failure mode of a full-bleed overlay.
  const flyerCard = (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#000000",
        padding: "72px 56px",
        fontFamily,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {logoDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUri} width={88} height={88} style={{ borderRadius: 16, marginBottom: 18 }} />
        )}
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: CREAM, letterSpacing: 3 }}>
          {dateLabel}
        </div>
        <div style={{ marginTop: 16, width: 160, height: 8, backgroundColor: RED }} />
        {statusChip}
      </div>

      {/* Flyer, fully visible */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flyerDataUri ?? ""}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12 }}
        />
      </div>

      {/* Footer — the bill is always printed here, even over a flyer, since a
          photo-only flyer may carry none of this text itself. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 800, color: CREAM, lineHeight: 1.1 }}>
          {truncate(headliner, 34)}
        </div>
        {support.length > 0 && (
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 28,
              fontWeight: 500,
              color: CREAM,
              opacity: 0.75,
              lineHeight: 1.25,
            }}
          >
            {truncate(`with ${support.join(", ")}`, 64)}
          </div>
        )}
        <div style={{ display: "flex", marginTop: 20, fontSize: 34, fontWeight: 500, color: RED }}>
          {timeLabel ? `${truncate(show.venue, 28)} · ${timeLabel}` : truncate(show.venue, 32)}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 26,
            fontWeight: 800,
            color: CREAM,
            opacity: 0.7,
            letterSpacing: 3,
          }}
        >
          TWIN SCENE · twinscene.org
        </div>
      </div>
    </div>
  );

  const textCard = (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#000000",
          padding: "88px 72px",
          fontFamily,
        }}
      >
        {/* Header: logo + date */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {logoDataUri && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUri} width={120} height={120} style={{ borderRadius: 20, marginBottom: 28 }} />
          )}
          <div style={{ fontSize: 44, fontWeight: 500, color: RED, letterSpacing: 4 }}>{dateLabel}</div>
          <div style={{ marginTop: 24, width: 220, height: 8, backgroundColor: RED }} />
          {statusChip}
        </div>

        {/* Body: headliner + support bill, vertically centered */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: headlineSize,
              fontWeight: 800,
              color: CREAM,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            {truncate(headliner, 48)}
          </div>

          {support.length > 0 && (
            <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 500, color: RED, letterSpacing: 5, marginBottom: 18 }}>
                WITH
              </div>
              {support.slice(0, 5).map((act) => (
                <div
                  key={act}
                  style={{
                    display: "flex",
                    fontSize: 44,
                    fontWeight: 500,
                    color: CREAM,
                    opacity: 0.85,
                    lineHeight: 1.35,
                  }}
                >
                  {truncate(act, 40)}
                </div>
              ))}
              {support.length > 5 && (
                <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: CREAM, opacity: 0.5, marginTop: 8 }}>
                  {`+${support.length - 5} more`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: venue + time + brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ marginBottom: 40, width: 220, height: 8, backgroundColor: RED }} />
          <div
            style={{
              display: "flex",
              fontSize: 52,
              fontWeight: 800,
              color: CREAM,
              lineHeight: 1.1,
              textAlign: "center",
            }}
          >
            {truncate(show.venue, 34)}
          </div>
          {timeLabel && (
            <div style={{ display: "flex", marginTop: 12, fontSize: 40, fontWeight: 500, color: RED }}>
              {timeLabel}
            </div>
          )}
          <div
            style={{
              display: "flex",
              marginTop: 44,
              fontSize: 30,
              fontWeight: 800,
              color: CREAM,
              opacity: 0.7,
              letterSpacing: 3,
            }}
          >
            TWIN SCENE · twinscene.org
          </div>
        </div>
      </div>
  );

  return new ImageResponse(flyerDataUri ? flyerCard : textCard, {
    width: WIDTH,
    height: HEIGHT,
    fonts: fonts.length > 0 ? fonts : undefined,
  });
}
