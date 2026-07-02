import Link from "next/link";
import type { Metadata } from "next";
import { fetchShows, type Show } from "@/lib/fetchShows";

export const metadata: Metadata = {
  title: "Upcoming Shows — Twin Scene",
  description: "Upcoming shows submitted by bands in the Twin Cities music scene.",
};

/** Prefix a bare URL with https:// so hrefs from the sheet always resolve. */
function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Format an ISO "YYYY-MM-DD" date as e.g. "Saturday, July 12". Parsed and
 * formatted in UTC so a "2026-07-15" string never shifts a day across the
 * viewer's timezone. Unexpected formats fall back to the raw string.
 */
function formatDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Group already-date-sorted shows into consecutive same-date buckets. */
function groupByDate(shows: Show[]): { date: string; shows: Show[] }[] {
  const groups: { date: string; shows: Show[] }[] = [];
  for (const show of shows) {
    const last = groups[groups.length - 1];
    if (last && last.date === show.date) last.shows.push(show);
    else groups.push({ date: show.date, shows: [show] });
  }
  return groups;
}

export default async function ShowsPage() {
  const shows = await fetchShows();
  const groups = groupByDate(shows);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <nav className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
          >
            <span aria-hidden>←</span> Directory
          </Link>
          <Link
            href="/shows/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add a show →
          </Link>
        </nav>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Upcoming Shows
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Shows submitted by Twin Cities bands
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm leading-relaxed text-[#E8E0D0]/60">
            No upcoming shows yet. Add your band and list your shows.
          </p>
          <Link
            href="/submit"
            className="mt-6 inline-block rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
          >
            Add your band →
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
                {formatDateLabel(group.date)}
              </h2>
              <ul className="space-y-3">
                {group.shows.map((show, i) => (
                  <li
                    key={`${show.title}-${show.venue}-${i}`}
                    className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[#E8E0D0]">
                          {show.title}
                        </p>
                        {show.venue && (
                          <p className="mt-0.5 text-sm text-[#E8E0D0]/75">
                            {show.venue}
                          </p>
                        )}
                        {show.lineup && show.lineup !== show.title && (
                          <p className="mt-1 text-sm text-[#E8E0D0]/60">
                            {show.lineup}
                          </p>
                        )}
                        {show.notes && (
                          <p className="mt-1 text-sm text-[#E8E0D0]/50">
                            {show.notes}
                          </p>
                        )}
                      </div>
                      {show.link && (
                        <a
                          href={ensureUrl(show.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0] transition hover:bg-[#E8E0D0]/10"
                        >
                          Tickets / Info →
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
