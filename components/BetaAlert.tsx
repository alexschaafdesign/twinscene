import Link from "next/link";

// Purely presentational — visibility and dismissal are owned by
// HomeIntroRow, which decides whether this (and its layout wrapper) render
// at all.
export default function BetaAlert({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="relative rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-4 py-3.5 pr-10 text-[13px] leading-relaxed text-[#E8E0D0]/90"
    >
      <button
        type="button"
        aria-label="Dismiss beta notice"
        onClick={onDismiss}
        className="absolute right-2.5 top-2.5 rounded p-1 text-[#E8E0D0]/60 transition hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
      >
        <span aria-hidden>×</span>
      </button>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="shrink-0 rounded bg-[#E8B84B]/20 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#E8B84B]"
        >
          Beta
        </span>
        <p className="m-0 font-medium text-[#E8E0D0]">
          This site is in early beta — here&apos;s where it&apos;s
          headed, with more to come! Send me any ideas!
        </p>
      </div>
      <ul className="mt-2.5 list-disc space-y-1 pl-8 marker:text-[#E8B84B]/60">
        <li>Every band in town can have a profile, free to edit as you like</li>
        <li>
          Every show in town is listed in the{" "}
          <Link href="/shows" className="underline hover:text-[#E8E0D0]">
            Shows
          </Link>{" "}
          tab (in progress)
        </li>
        <li>
          Shows are automatically linked to bands, so a band&apos;s profile
          shows any upcoming dates
        </li>
        <li>
          The{" "}
          <Link href="/musicians" className="underline hover:text-[#E8E0D0]">
            Musicians
          </Link>{" "}
          tab lists individual members, tracing them across multiple bands
        </li>
        <li>
          Band profiles include any undercurrentMPLS videos of them, pulled
          from undercurrent&apos;s incredible YouTube channel
        </li>
      </ul>
      <p className="m-0 mt-2.5">
        Hit up alex@thebirdhaus.org with any comments/suggestions!
      </p>
    </div>
  );
}
