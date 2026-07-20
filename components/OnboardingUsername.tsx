"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The first onboarding step (app/welcome/page.tsx): confirm or change the
// default username the account was created with. The default is already saved
// (see lib/auth.ts assignDefaultUsername), so this is purely a chance to
// rename it before diving in — leaving it as-is is a valid choice, and the
// role picker below can be submitted independently. Saving here reuses the
// same PATCH /api/profile the full profile editor uses, so validation and
// "taken" handling stay in one place.
export default function OnboardingUsername({ initialUsername }: { initialUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [saved, setSaved] = useState(initialUsername);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = username.trim();
  const dirty = trimmed !== saved;

  async function save() {
    if (!dirty) return;
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Couldn't save that username");
        setState("error");
        return;
      }
      const next = data.user?.username ?? trimmed;
      setUsername(next);
      setSaved(next);
      setState("saved");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setState("error");
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#E8B84B]/25 bg-gradient-to-br from-[#E8B84B]/[0.1] via-[#E8B84B]/[0.02] to-transparent px-5 py-4">
      <h2 className="text-sm font-semibold text-[#E8E0D0]">Your username</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#E8E0D0]/60">
        We picked one from your email — keep it or make it yours. You can always
        change it later in your profile.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-[#E8E0D0]/50">@</span>
        <input
          id="onboarding-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (state !== "idle") setState("idle");
            if (error) setError(null);
          }}
          maxLength={30}
          placeholder="yourname"
          aria-invalid={!!error}
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-black/20 px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8B84B] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || state === "saving"}
          className="shrink-0 rounded-md border border-[#E8E0D0]/40 px-3 py-2 text-xs transition hover:bg-[#E8E0D0]/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="mt-2 text-xs text-[#E8E0D0]/40">
        Your profile: <span className="text-[#E8E0D0]/60">twinscene.org/u/{trimmed || "…"}</span>
      </p>
      {state === "saved" && !dirty && <p className="mt-1 text-xs text-[#9FD3A0]">Saved.</p>}
      {error && <p className="mt-1 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
