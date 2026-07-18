"use client";

import { useState } from "react";
import type { OwnershipCodeStatus } from "@/lib/bandOwnership";

// Admin-only "generate an ownership code" action plus a status-only history
// of codes issued for this band. The generated code is shown exactly once —
// after this render it exists only in the DM the admin sends, never again in
// this UI or in the DB (only its hash is stored).
export default function OwnershipCodeManager({
  slug,
  initialCodes,
}: {
  slug: string;
  initialCodes: OwnershipCodeStatus[];
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setStatus("generating");
    setError("");
    setCopied(false);
    try {
      const res = await fetch(`/api/admin/bands/${slug}/ownership-code`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setGeneratedCode(data.code);
      setStatus("idle");

      const listRes = await fetch(`/api/admin/bands/${slug}/ownership-code`);
      const listData = await listRes.json();
      if (listRes.ok && listData.success) {
        setCodes(listData.codes);
      }
    } catch {
      setError("Something went wrong");
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleGenerate}
        disabled={status === "generating"}
        className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10 disabled:opacity-50"
      >
        {status === "generating" ? "Generating…" : "Generate ownership code"}
      </button>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}

      {generatedCode && (
        <div className="mt-3 rounded-md border border-[#E8E0D0]/25 p-3.5">
          <p className="text-sm text-[#E8E0D0]/70">
            DM this code to the band&apos;s verified Instagram account. It won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="break-all rounded bg-[#E8E0D0]/10 px-2 py-1 text-sm">{generatedCode}</code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {codes.length === 0 && (
          <li className="text-sm text-[#E8E0D0]/50">No ownership codes issued yet.</li>
        )}
        {codes.map((c) => {
          const expired = !c.redeemed_at && new Date(c.expires_at) < new Date();
          return (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
            >
              <span>Issued {new Date(c.created_at).toLocaleDateString()}</span>
              <span className="text-[#E8E0D0]/60">
                {c.redeemed_by_email
                  ? `Redeemed by ${c.redeemed_by_email}`
                  : expired
                    ? "Expired"
                    : `Expires ${new Date(c.expires_at).toLocaleDateString()}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
