"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { id: "musician", label: "I'm a musician / in a band", hint: "Find or create your musician profile." },
  { id: "band", label: "I have a band (owner or manager)", hint: "Find your band, or add it if it's new." },
  { id: "photographer", label: "I'm a photographer", hint: "Coming soon — we'll let you know." },
  { id: "venue", label: "I run or work at a venue", hint: "Coming soon — we'll let you know." },
] as const;

// Fixed dispatch order for app/welcome/flow/page.tsx, independent of click
// order, so the flow is predictable regardless of which boxes someone checks
// first.
const ROLE_ORDER = ROLES.map((r) => r.id);

// Step 1 of the guided onboarding flow (app/welcome/page.tsx): "who are
// you?" Multiple can apply — a person can be both a musician and a venue
// employee — so this is checkboxes, not radios. Picking nothing (or "just
// browsing") skips straight to the closing step.
export default function OnboardingRoleForm({ next }: { next: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const queue = ROLE_ORDER.filter((id) => selected.has(id));
    if (queue.length === 0) {
      router.push(`/welcome/done?next=${encodeURIComponent(next)}`);
      return;
    }
    router.push(`/welcome/flow?queue=${queue.join(",")}&next=${encodeURIComponent(next)}`);
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        {ROLES.map((role) => (
          <label
            key={role.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-[#E8E0D0]/15 px-3.5 py-3 transition hover:border-[#E8E0D0]/30"
          >
            <input
              type="checkbox"
              checked={selected.has(role.id)}
              onChange={() => toggle(role.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#E8B84B]"
            />
            <span>
              <span className="block text-sm text-[#E8E0D0]">{role.label}</span>
              <span className="block text-[13px] text-[#E8E0D0]/50">{role.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
        >
          Continue
        </button>
        {selected.size === 0 && (
          <span className="text-sm text-[#E8E0D0]/50">Just here to browse? Continue skips ahead.</span>
        )}
      </div>
    </form>
  );
}
