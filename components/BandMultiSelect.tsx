"use client";

import { useMemo, useRef, useState } from "react";

export interface BandOption {
  name: string;
  slug: string;
}

// Type-to-search multi-select for tagging bands, mirroring BandLinkSearch's
// in-memory filter (the full directory is passed in as a prop, so matching is
// instant with no network round-trip). Selected bands render as removable
// chips; `value`/`onChange` are the selected slugs, which the article form
// serializes to article_entities on save.
export default function BandMultiSelect({
  bands,
  value,
  onChange,
}: {
  bands: BandOption[];
  value: string[]; // selected slugs
  onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const bySlug = useMemo(() => new Map(bands.map((b) => [b.slug, b])), [bands]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bands
      .filter((b) => !value.includes(b.slug) && b.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [bands, query, value]);

  function add(slug: string) {
    if (!value.includes(slug)) onChange([...value, slug]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(slug: string) {
    onChange(value.filter((s) => s !== slug));
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => remove(slug)}
                className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D0]/30 bg-[#E8E0D0]/10 px-2.5 py-1 text-xs text-[#E8E0D0]/85 transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/15"
              >
                {bySlug.get(slug)?.name ?? slug}
                <span aria-hidden className="text-[#E8E0D0]/50">
                  ✕
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a band name…"
          autoComplete="off"
          className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
        />
        {query.trim() && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[#E8E0D0]/20 bg-[#141210] shadow-lg">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[#E8E0D0]/45">No bands match that.</li>
            ) : (
              matches.map((b) => (
                <li key={b.slug}>
                  <button
                    type="button"
                    onClick={() => add(b.slug)}
                    className="block w-full px-3 py-2 text-left text-sm text-[#E8E0D0]/90 transition hover:bg-[#E8E0D0]/10"
                  >
                    {b.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
