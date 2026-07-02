"use client";

import { useMemo, useState } from "react";

export type SuggestedMatch = {
  slug: string;
  name: string;
  scrapedName: string;
  confidence: "auto" | "review";
};

export type ImportShow = {
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
  alreadyImported: boolean;
};

export type BandOption = { slug: string; name: string };

type RowStatus = "idle" | "submitting" | "done" | "error";

const inputClass =
  "w-full rounded-md border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8E0D0]";

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
}: {
  show: ImportShow;
  bands: BandOption[];
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

  async function confirm() {
    const url = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;
    if (!url) {
      setStatus("error");
      setErrorMsg("Submission endpoint isn't configured.");
      return;
    }
    if (!date.trim() || !venue.trim() || !title.trim()) {
      setStatus("error");
      setErrorMsg("Date, venue, and title are required.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    try {
      const payload = new URLSearchParams({
        formType: "showImport",
        source: "pilllar",
        sourceKey: show.sourceKey,
        date: date.trim(),
        venue: venue.trim(),
        title: title.trim(),
        lineup: lineup.trim(),
        bandSlugs: links.map((l) => l.slug).join(","),
        notes: notes.trim(),
        link: link.trim(),
      });
      const res = await fetch(url, { method: "POST", body: payload });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Import failed");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <li className="rounded-md border border-[#E8E0D0]/12 bg-[rgba(232,224,208,0.04)] p-4">
      <div className="flex gap-4">
        {show.flyerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external flyer art
          <img
            src={show.flyerUrl}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded object-cover ring-1 ring-[#E8E0D0]/10"
          />
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

export default function ShowImportReview({
  shows,
  bandOptions,
}: {
  shows: ImportShow[];
  bandOptions: BandOption[];
}) {
  const pending = useMemo(
    () => shows.filter((s) => !s.alreadyImported).length,
    [shows],
  );

  if (shows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[#E8E0D0]/60">
        No shows scraped.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-[#E8E0D0]/50">
        {shows.length} show{shows.length === 1 ? "" : "s"} scraped · {pending}{" "}
        not yet on the schedule
      </p>
      <ul className="space-y-3">
        {shows.map((show, i) => (
          <ShowCard
            key={`${show.sourceKey}-${i}`}
            show={show}
            bands={bandOptions}
          />
        ))}
      </ul>
    </div>
  );
}
