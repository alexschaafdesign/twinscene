import { ImageResponse } from "next/og";
import { fetchShows } from "@/lib/fetchShows";
import { loadBricolageWeight, loadLogoDataUri } from "@/lib/ogAssets";

// fs + Postgres access, so this needs the Node.js runtime, not Edge.
export const runtime = "nodejs";
// Depends on "today" and live show data — never statically optimized.
export const dynamic = "force-dynamic";

const WIDTH = 1080;
const HEIGHT = 1920;
const MAX_SHOWS = 12;

const CREAM = "#e8e0d0";
const RED = "#b42318";

/**
 * The date this graphic is FOR, as "YYYY-MM-DD" in America/Chicago — the next
 * calendar day, since these are always made the day before and posted the day
 * of. That's also why the graphic itself says "TODAY": by the time it's
 * posted, this date is today for whoever's looking at it.
 */
function showDateInChicago(): string {
  const showDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(showDay);
}

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

/**
 * Best-effort start time for sorting/label. Prefers the structured
 * music_time/doors_time (Show.musicTime/doorsTime, "7:00pm"; migration 0039),
 * falling back to the old free-text `notes` format ("Music H:MM AM/PM …") for
 * rows scraped before those columns existed and not yet re-scraped. Manual
 * submissions with neither just don't match — they sort after timed shows.
 */
function parseShowTime(show: {
  musicTime: string;
  doorsTime: string;
  notes: string;
}): { minutes: number; label: string } | null {
  const structured = show.musicTime || show.doorsTime; // "7:00pm"
  const match = structured
    ? /(\d{1,2}):(\d{2})\s*([ap])m/i.exec(structured)
    : /Music\s+(\d{1,2}):(\d{2})\s*([AP])M/i.exec(show.notes) ??
      /Doors\s+(\d{1,2}):(\d{2})\s*([AP])M/i.exec(show.notes);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase(); // "A" | "P"
  if (meridiem === "P" && hour !== 12) hour += 12;
  if (meridiem === "A" && hour === 12) hour = 0;

  return {
    minutes: hour * 60 + minute,
    label: `${match[1]}:${match[2]} ${meridiem}M`,
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

type Density = "spacious" | "cozy" | "tight";

const DENSITY_SIZES: Record<
  Density,
  { venue: number; lineup: number; time: number; lineupMax: number; venueMax: number }
> = {
  spacious: { venue: 46, lineup: 32, time: 34, lineupMax: 60, venueMax: 34 },
  cozy: { venue: 40, lineup: 28, time: 30, lineupMax: 52, venueMax: 30 },
  tight: { venue: 34, lineup: 24, time: 26, lineupMax: 46, venueMax: 26 },
};

function densityFor(count: number): Density {
  if (count <= 5) return "spacious";
  if (count <= 8) return "cozy";
  return "tight";
}

export async function GET() {
  const showDate = showDateInChicago();
  const dateLabel = formatDateLabel(showDate);

  const allShows = await fetchShows();
  const showsToday = allShows.filter((show) => show.date === showDate);

  const sorted = [...showsToday].sort((a, b) => {
    const aTime = parseShowTime(a)?.minutes ?? Infinity;
    const bTime = parseShowTime(b)?.minutes ?? Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.venue.localeCompare(b.venue);
  });

  const visible = sorted.slice(0, MAX_SHOWS);
  const overflowCount = sorted.length - visible.length;
  const sizes = DENSITY_SIZES[densityFor(visible.length)];

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

  const header = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {logoDataUri && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoDataUri}
          width={120}
          height={120}
          style={{ borderRadius: 20, marginBottom: 28 }}
        />
      )}
      <div
        style={{
          fontSize: 128,
          fontWeight: 800,
          color: CREAM,
          lineHeight: 1,
          letterSpacing: -3,
        }}
      >
        TODAY
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 42,
          fontWeight: 500,
          color: RED,
          letterSpacing: 3,
        }}
      >
        {dateLabel}
      </div>
      <div style={{ marginTop: 24, width: 220, height: 8, backgroundColor: RED }} />
    </div>
  );

  const footer = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", fontSize: 38, fontWeight: 800, color: CREAM, letterSpacing: 2 }}>
        TWIN SCENE
      </div>
    </div>
  );

  const body =
    visible.length === 0 ? (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: CREAM,
            textAlign: "center",
            letterSpacing: -1,
          }}
        >
          NOTHING ON THE BOOKS
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 30,
            fontWeight: 500,
            color: CREAM,
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          Check back soon — or be the first to add a show.
        </div>
      </div>
    ) : (
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {visible.map((show, i) => (
          <div
            key={show.id}
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
              borderTop: i > 0 ? "2px solid rgba(232,224,208,0.15)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  paddingRight: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: sizes.venue,
                    fontWeight: 800,
                    color: CREAM,
                    lineHeight: 1.1,
                  }}
                >
                  {truncate(show.venue, sizes.venueMax)}
                </div>
                {show.lineup && (
                  <div
                    style={{
                      display: "flex",
                      marginTop: 6,
                      fontSize: sizes.lineup,
                      fontWeight: 500,
                      color: CREAM,
                      opacity: 0.75,
                      lineHeight: 1.2,
                    }}
                  >
                    {truncate(show.lineup, sizes.lineupMax)}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: sizes.time,
                  fontWeight: 800,
                  color: RED,
                  whiteSpace: "nowrap",
                }}
              >
                {parseShowTime(show)?.label ?? "TBA"}
              </div>
            </div>
          </div>
        ))}
        {overflowCount > 0 && (
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 28,
              fontWeight: 500,
              color: CREAM,
              opacity: 0.6,
            }}
          >
            {`+${overflowCount} more shows tonight`}
          </div>
        )}
      </div>
    );

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#000000",
          padding: "72px 72px",
          fontFamily,
        }}
      >
        {header}
        <div style={{ marginTop: 48, marginBottom: 32, flex: 1, display: "flex", flexDirection: "column" }}>
          {body}
        </div>
        {footer}
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: { "X-Show-Date": showDate },
    },
  );
}
