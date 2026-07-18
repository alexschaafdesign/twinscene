"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MusicianEntry } from "@/lib/musicians";

export default function MusiciansTable({ musicians }: { musicians: MusicianEntry[] }) {
  const [query, setQuery] = useState("");
  // "count" (the default — most bands first, already the incoming order) or
  // "name" (A-Z). Mirrors the sort toggle pattern on the bands grid.
  const [sort, setSort] = useState<"count" | "name">("count");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return musicians;
    return musicians.filter((m) => {
      const haystack = [m.name, ...m.bands.map((b) => b.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [musicians, query]);

  const sorted = useMemo(() => {
    if (sort === "count") return filtered;
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [filtered, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by musician or band name…"
          className="w-full flex-1 rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none sm:max-w-sm"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#E8E0D0]/45">Sort</span>
          <div className="flex items-center gap-0.5 rounded-md border border-[#E8E0D0]/20 p-0.5">
            <button
              type="button"
              onClick={() => setSort("count")}
              aria-pressed={sort === "count"}
              className={`rounded px-2.5 py-1 text-xs transition ${
                sort === "count"
                  ? "bg-[#E8E0D0] text-[#2A2420]"
                  : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
              }`}
            >
              Most bands
            </button>
            <button
              type="button"
              onClick={() => setSort("name")}
              aria-pressed={sort === "name"}
              className={`rounded px-2.5 py-1 text-xs transition ${
                sort === "name"
                  ? "bg-[#E8E0D0] text-[#2A2420]"
                  : "text-[#E8E0D0]/55 hover:text-[#E8E0D0]"
              }`}
            >
              A–Z
            </button>
          </div>
        </div>
      </div>

      <p className="mb-3 text-xs text-[#E8E0D0]/55">
        Showing {sorted.length} of {musicians.length} musicians
      </p>

      {sorted.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/50">
          No musicians match that search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E8E0D0]/15">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/15 text-[11px] font-semibold uppercase tracking-wider text-[#E8E0D0]/45">
                <th className="px-4 py-2.5 font-semibold">Musician</th>
                <th className="px-4 py-2.5 font-semibold">Bands</th>
                <th className="px-4 py-2.5 text-right font-semibold"># Bands</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((musician) => (
                <tr
                  key={musician.id}
                  className="border-b border-[#E8E0D0]/10 last:border-0"
                >
                  <td className="px-4 py-2.5 font-medium text-[#E8E0D0]">
                    {musician.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {musician.bands.map((band) => (
                        <Link
                          key={band.slug}
                          href={`/bands/${band.slug}`}
                          className="rounded-full bg-[#E8E0D0]/10 px-2.5 py-0.5 text-xs text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/20 hover:text-[#E8E0D0]"
                        >
                          {band.name}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#E8E0D0]/70">
                    {musician.bands.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
