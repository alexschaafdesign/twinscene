"use client";

import { useEffect, useMemo, useState } from "react";
import { postToAppsScript } from "@/lib/postToAppsScript";

export type SuggestedMatch = {
  slug: string;
  name: string;
  scrapedName: string;
  confidence: "auto" | "review";
};

export type ImportShow = {
  source: string; // scraper id, sent through on confirm (e.g. "pilllar", "zhora")
  sourceKey: string;
  date: string;
  venue: string;
  title: string;
  lineup: string;
  notes: string;
  link: string;
  flyerUrl: string | null;
  suggested: SuggestedMatch[];
  autoSlugs: string[];
  unmatched: string[]; // scraped band names not in the directory (confidence 'none')
  alreadyImported: boolean;
};

export type BandOption = { slug: string; name: string };

type RowStatus = "idle" | "submitting" | "done" | "error";

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

/** Lowercase/hyphenate a band name. Kept in sync with slugify in fetchBands. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A scraped act that isn't in the directory. "Add to directory" normally opens
 * the prefilled add-band form in a new tab so you can add a photo, genres, bio,
 * etc. before submitting.
 *
 * TEMP: for bulk entry, this now submits the band to the directory directly
 * with only the Band name filled in (no new tab), then links it to the show —
 * the add-mode slug matches slugify(name), so the link resolves once the band
 * is approved. Revert this component to restore the open-the-form behavior.
 */
function UnmatchedBand({
  name,
  onAdded,
}: {
  name: string;
  onAdded: (band: BandOption) => void;
}) {
  const [status, setStatus] = useState<RowStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function addBand() {
    if (status === "submitting" || status === "done") return;
    const url = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
    if (!url) {
      setStatus("error");
      setErrorMsg("Submission endpoint isn't configured.");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      // Mirror SubmitForm's add payload, but with only the band name filled in.
      const payload = new URLSearchParams({
        bandName: name,
        submitterName: "",
        submitterEmail: "",
        genres: "",
        location: "",
        neighborhoods: "",
        members: "",
        contactEmail: "",
        contactMethod: "",
        website: "",
        instagram: "",
        bandcamp: "",
        bio: "",
        notes: "",
        existingSlug: "",
        mode: "add",
        bandSlug: slugify(name),
        removeImage: "false",
        featuredLinks: "[]",
        // TEMP: skip the per-band notification email for these bulk quick-adds
        // (Apps Script honors quickAdd to avoid an extra round-trip per add).
        quickAdd: "true",
      });
      const data = await postToAppsScript(url, payload);
      if (!data.success) throw new Error(data.error || "Add failed");
      onAdded({ slug: slugify(name), name });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Add failed");
    }
  }

  const busy = status === "submitting";

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span style={{ color: "rgba(232,224,208,0.5)" }}>{name}</span>
      {status !== "done" && (
        <button
          type="button"
          onClick={addBand}
          disabled={busy}
          className="cursor-pointer text-xs text-[#E8E0D0]/50 underline underline-offset-2 transition hover:text-[#E8E0D0] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Adding…" : "+ Add to directory"}
        </button>
      )}
      {status === "done" && (
        <span className="rounded bg-[#6FBF73]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8FD693]">
          ✓ added & linked
        </span>
      )}
      {status === "error" && (
        <span className="text-xs text-[#E5A0A0]">{errorMsg}</span>
      )}
    </li>
  );
}

/** Compact directory search that adds a band on selection. */
function BandPicker({
  bands,
  selectedSlugs,
  onAdd,
  disabled,
}: {
  bands: BandOption[];
  selectedSlugs: Set<string>;
  onAdd: (band: BandOption) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const qLower = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!qLower) return [];
    return bands
      .filter(
        (b) => !selectedSlugs.has(b.slug) && b.name.toLowerCase().includes(qLower),
      )
      .slice(0, 6);
  }, [bands, selectedSlugs, qLower]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Link a directory band…"
        className={inputClass}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-[180px] w-full overflow-auto rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] py-1 shadow-lg">
          {matches.map((b) => (
            <li key={b.slug}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAdd(b);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-sm text-[#E8E0D0] hover:bg-[#E8E0D0]/10"
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[#E8E0D0]/55">{label}</span>
      {children}
    </label>
  );
}

function ShowCard({
  show,
  bands,
  hidden,
  secret,
}: {
  show: ImportShow;
  bands: BandOption[];
  hidden?: boolean;
  secret: string;
}) {
  const [date, setDate] = useState(show.date);
  const [venue, setVenue] = useState(show.venue);
  const [title, setTitle] = useState(show.title);
  const [lineup, setLineup] = useState(show.lineup);
  const [notes, setNotes] = useState(show.notes);
  const [link, setLink] = useState(show.link);

  // Directory band links, seeded from the auto-confidence matches.
  const [links, setLinks] = useState<BandOption[]>(() =>
    show.suggested
      .filter((s) => show.autoSlugs.includes(s.slug))
      .map((s) => ({ slug: s.slug, name: s.name })),
  );

  const [status, setStatus] = useState<RowStatus>(
    show.alreadyImported ? "done" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Close the expanded flyer on Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const selectedSlugs = useMemo(
    () => new Set(links.map((l) => l.slug)),
    [links],
  );

  function addLink(band: BandOption) {
    setLinks((prev) =>
      prev.some((l) => l.slug === band.slug) ? prev : [...prev, band],
    );
  }
  function removeLink(slug: string) {
    setLinks((prev) => prev.filter((l) => l.slug !== slug));
  }

  // Review-confidence suggestions not already linked — offered as quick-adds.
  const reviewSuggestions = show.suggested.filter(
    (s) => !selectedSlugs.has(s.slug),
  );

  const busy = status === "submitting";

  // Recover each linked band's original scraped lineup name (from the
  // suggestion it came from) so the lineup jsonb can pair {name, bandSlug}
  // correctly; falls back to the directory name for bands added via search
  // or quick-add, where the typed name already matches the lineup text.
  function resolveLinkedBands(): { name: string; slug: string }[] {
    const scrapedNameBySlug = new Map(
      show.suggested.map((s) => [s.slug, s.scrapedName]),
    );
    return links.map((l) => ({
      name: scrapedNameBySlug.get(l.slug) ?? l.name,
      slug: l.slug,
    }));
  }

  async function confirm() {
    if (!date.trim() || !venue.trim() || !title.trim()) {
      setStatus("error");
      setErrorMsg("Date, venue, and title are required.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/scrapers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          actor: "admin",
          source: show.source,
          sourceKey: show.sourceKey,
          date: date.trim(),
          venue: venue.trim(),
          title: title.trim(),
          lineup: lineup.trim(),
          linkedBands: resolveLinkedBands(),
          notes: notes.trim(),
          link: link.trim(),
          flyerUrl: show.flyerUrl ?? "",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Import failed");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <li
      className={`rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-4${
        hidden ? " hidden" : ""
      }`}
    >
      {expanded && show.flyerUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Show flyer"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external flyer art */}
          <img
            src={show.flyerUrl}
            alt=""
            className="max-h-full max-w-full rounded shadow-2xl"
          />
        </div>
      )}
      <div className="flex gap-4">
        {show.flyerUrl && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand flyer"
            className="h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded ring-1 ring-[#E8E0D0]/10 transition hover:ring-[#E8E0D0]/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external flyer art */}
            <img
              src={show.flyerUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-[#E8E0D0]">
              {title || "(untitled show)"}
            </p>
            {status === "done" && (
              <span className="shrink-0 rounded bg-[#6FBF73]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8FD693]">
                on schedule
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="Date">
              <input
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </LabeledField>
            <LabeledField label="Venue">
              <input
                type="text"
                value={venue}
                disabled={busy}
                onChange={(e) => setVenue(e.target.value)}
                className={inputClass}
              />
            </LabeledField>
          </div>

          <LabeledField label="Title (marquee)">
            <input
              type="text"
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </LabeledField>

          <LabeledField label="Lineup">
            <input
              type="text"
              value={lineup}
              disabled={busy}
              onChange={(e) => setLineup(e.target.value)}
              className={inputClass}
            />
          </LabeledField>

          <div>
            <span className="mb-1 block text-xs text-[#E8E0D0]/55">
              Linked directory bands
            </span>
            {links.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {links.map((l) => (
                  <span
                    key={l.slug}
                    className="inline-flex items-center gap-1 rounded bg-[#E8E0D0]/15 px-2 py-0.5 text-xs text-[#E8E0D0]"
                  >
                    {l.name}
                    <button
                      type="button"
                      aria-label={`Unlink ${l.name}`}
                      disabled={busy}
                      onClick={() => removeLink(l.slug)}
                      className="text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <BandPicker
              bands={bands}
              selectedSlugs={selectedSlugs}
              onAdd={addLink}
              disabled={busy}
            />
            {reviewSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">
                  Suggested:
                </span>
                {reviewSuggestions.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    disabled={busy}
                    onClick={() => addLink({ slug: s.slug, name: s.name })}
                    className="inline-flex items-center gap-1 rounded border border-[#D9A441]/40 px-2 py-0.5 text-xs text-[#E4BC6E] transition hover:bg-[#D9A441]/10"
                  >
                    + {s.name}
                    {s.scrapedName !== s.name && (
                      <span className="text-[#E4BC6E]/60">
                        (“{s.scrapedName}”)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {show.unmatched.length > 0 && (
            <div>
              <span className="mb-1 block text-xs text-[#E8E0D0]/55">
                Unmatched bands
              </span>
              <ul className="space-y-1">
                {show.unmatched.map((name) => (
                  <UnmatchedBand key={name} name={name} onAdded={addLink} />
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="Notes">
              <input
                type="text"
                value={notes}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label="Ticket / info link">
              <input
                type="url"
                value={link}
                disabled={busy}
                onChange={(e) => setLink(e.target.value)}
                className={inputClass}
              />
            </LabeledField>
          </div>

          {status === "error" && (
            <p className="text-xs text-[#E5A0A0]">{errorMsg}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "Adding…"
                : status === "done"
                  ? "Update on schedule"
                  : "Add to schedule"}
            </button>
            {links.length === 0 && status !== "done" && (
              <span className="text-xs text-[#E8E0D0]/40">
                No bands linked — still adds to the schedule.
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

type Filter = "review" | "scheduled" | "all";

/** Whether a show belongs in the given filter view. */
function inFilter(show: ImportShow, filter: Filter): boolean {
  if (filter === "review") return !show.alreadyImported;
  if (filter === "scheduled") return show.alreadyImported;
  return true;
}

export default function ShowImportReview({
  shows,
  bandOptions,
  secret,
}: {
  shows: ImportShow[];
  bandOptions: BandOption[];
  secret: string;
}) {
  const [filter, setFilter] = useState<Filter>("review");

  const pending = useMemo(
    () => shows.filter((s) => !s.alreadyImported).length,
    [shows],
  );
  const scheduled = shows.length - pending;
  const counts: Record<Filter, number> = {
    review: pending,
    scheduled,
    all: shows.length,
  };

  const tabs: { key: Filter; label: string }[] = [
    { key: "review", label: "Needs review" },
    { key: "scheduled", label: "On schedule" },
    { key: "all", label: "All" },
  ];

  const plural = (n: number) => (n === 1 ? "" : "s");
  const summary =
    filter === "all"
      ? `${shows.length} show${plural(shows.length)} scraped · ${pending} not yet on the schedule`
      : filter === "review"
        ? `${pending} show${plural(pending)} not yet on the schedule`
        : `${scheduled} show${plural(scheduled)} on the schedule`;

  if (shows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
        No shows scraped.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-pressed={active}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[#E8E0D0] text-[#2A2420]"
                  : "border border-[#E8E0D0]/25 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
              }`}
            >
              {t.label}{" "}
              <span className={active ? "opacity-60" : "opacity-50"}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-4 text-xs text-[#E8E0D0]/50">{summary}</p>

      {counts[filter] === 0 ? (
        <p className="py-12 text-center text-sm text-[#E8E0D0]/50">
          {filter === "review"
            ? "Nothing to review — every scraped show is on the schedule."
            : "No shows on the schedule yet."}
        </p>
      ) : null}

      {/* Every card stays mounted (non-matching ones are hidden) so per-show
          edits are preserved when switching tabs. */}
      <ul className="space-y-3">
        {shows.map((show, i) => (
          <ShowCard
            key={`${show.sourceKey}-${i}`}
            show={show}
            bands={bandOptions}
            hidden={!inFilter(show, filter)}
            secret={secret}
          />
        ))}
      </ul>
    </div>
  );
}
