"use client";

import { useEffect, useRef, useState } from "react";

// Inline, per-user "Manage access" panel on the admin Users page. Collapsed by
// default (just a toggle button, so a 100-row table stays cheap); on first
// expand it lazy-loads the user's current grants. An admin can then pick an
// identity type, search it, and grant/revoke — the user-centric inverse of the
// account-side editor pages. Every action hits the is_admin-gated
// /api/admin/users/[id]/grants + /api/admin/identities/search routes.

type GrantType = "band" | "writer" | "comrade" | "musician";

const TYPES: { value: GrantType; label: string; hint: string }[] = [
  { value: "band", label: "Band", hint: "Bands" },
  { value: "writer", label: "Writer", hint: "Reads" },
  { value: "comrade", label: "Comrade", hint: "Comrades" },
  { value: "musician", label: "Musician", hint: "Musicians" },
];

const TYPE_LABEL: Record<GrantType, string> = {
  band: "Band",
  writer: "Writer",
  comrade: "Comrade",
  musician: "Musician",
};

interface Grant {
  type: GrantType;
  id: number;
  name: string;
  slug: string;
  role: string | null;
}

interface IdentityRef {
  id: number;
  name: string;
  slug: string;
}

export default function UserGrantsManager({
  userId,
  userLabel,
}: {
  userId: number;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Add-form state
  const [type, setType] = useState<GrantType>("band");
  const [role, setRole] = useState<"editor" | "owner">("editor");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IdentityRef[]>([]);
  const [searching, setSearching] = useState(false);

  // Lazy-load grants the first time the panel opens.
  useEffect(() => {
    if (!open || grants !== null) return;
    setLoading(true);
    fetch(`/api/admin/users/${userId}/grants`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setGrants(data.grants);
        else setError(data.error || "Couldn’t load access");
      })
      .catch(() => setError("Couldn’t load access"))
      .finally(() => setLoading(false));
  }, [open, grants, userId]);

  // Debounced typeahead. Re-runs on query/type change; a stale response is
  // dropped via the `active` flag so results always match the latest keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!open || !q) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/identities/search?type=${type}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          setResults(data.success ? data.results : []);
        })
        .catch(() => active && setResults([]))
        .finally(() => active && setSearching(false));
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, type, open]);

  const grantedIds = useRef<Set<string>>(new Set());
  grantedIds.current = new Set((grants ?? []).map((g) => `${g.type}:${g.id}`));

  async function handleGrant(target: IdentityRef) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target_id: target.id, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn’t grant access");
        return;
      }
      setGrants(data.grants);
      setQuery("");
      setResults([]);
    } catch {
      setError("Couldn’t grant access");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(g: Grant) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/grants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: g.type, target_id: g.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn’t revoke access");
        return;
      }
      setGrants(data.grants);
    } catch {
      setError("Couldn’t revoke access");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-[#E8E0D0]/30 px-2.5 py-1 text-xs text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/10"
      >
        Manage access
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[#E8E0D0]/50">
          Access for {userLabel}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-[#E8E0D0]/60 hover:underline"
        >
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#E8E0D0]/50">Loading…</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {grants && grants.length === 0 && (
              <li className="text-sm text-[#E8E0D0]/50">No editing access yet.</li>
            )}
            {grants?.map((g) => (
              <li
                key={`${g.type}:${g.id}`}
                className="flex items-center justify-between gap-3 rounded border border-[#E8E0D0]/12 px-3 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="rounded bg-[#E8E0D0]/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#E8E0D0]/70">
                    {TYPE_LABEL[g.type]}
                  </span>
                  <span>{g.name}</span>
                  {g.role && g.role !== "editor" && (
                    <span className="text-[#E8E0D0]/50">({g.role})</span>
                  )}
                </span>
                <button
                  onClick={() => handleRevoke(g)}
                  disabled={busy}
                  className="text-[#F5A3A3] hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-[#E8E0D0]/12 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-[#E8E0D0]/25">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setType(t.value);
                      setResults([]);
                    }}
                    className={`px-2.5 py-1 text-xs transition ${
                      type === t.value
                        ? "bg-[#E8E0D0]/20 text-[#E8E0D0]"
                        : "text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {type !== "musician" && (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "editor" | "owner")}
                  className="rounded-md border border-[#E8E0D0]/25 bg-transparent px-2 py-1 text-xs text-[#E8E0D0] focus:border-[#E8E0D0]/60 focus:outline-none"
                >
                  <option value="editor">editor</option>
                  <option value="owner">owner</option>
                </select>
              )}
            </div>

            <div className="relative mt-2">
              <input
                type="text"
                placeholder={`Search ${TYPES.find((t) => t.value === type)?.hint.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3 py-1.5 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
              />
              {query.trim() && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-[#E8E0D0]/25 bg-[#1a1a1a] shadow-lg">
                  {searching && (
                    <li className="px-3 py-2 text-sm text-[#E8E0D0]/50">Searching…</li>
                  )}
                  {!searching && results.length === 0 && (
                    <li className="px-3 py-2 text-sm text-[#E8E0D0]/50">No matches.</li>
                  )}
                  {results.map((r) => {
                    const already = grantedIds.current.has(`${type}:${r.id}`);
                    return (
                      <li key={r.id}>
                        <button
                          disabled={busy || already}
                          onClick={() => handleGrant(r)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
                        >
                          <span>{r.name}</span>
                          <span className="text-xs text-[#E8E0D0]/50">
                            {already ? "granted" : "grant →"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
