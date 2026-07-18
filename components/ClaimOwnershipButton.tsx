"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * "Is this your band?" entry point for an unclaimed band's page. Purely
 * informational — no claim is recorded here. Ownership is verified out of
 * band (Instagram DM), same trust model as the rest of Slice A
 * (lib/bandOwnership.ts): an admin confirms it's really the band, then sends
 * a one-time code the owner redeems at /redeem.
 */
export default function ClaimOwnershipButton() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        Is this your band?
      </h2>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[#E8E0D0]/70 underline underline-offset-2 hover:text-[#E8E0D0]"
      >
        I own this band
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Claim this band"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm rounded-lg border border-[#E8E0D0]/15 bg-[#141414] p-6 text-[#E8E0D0] shadow-2xl"
          >
            <h3 className="text-base font-medium">Claim this band</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#E8E0D0]/75">
              Send a DM to{" "}
              <span className="font-medium text-[#E8E0D0]">@twin.scene</span> on
              Instagram to verify you&apos;re actually the band. Once we&apos;ve
              confirmed it, we&apos;ll send you a one-time code — enter it at{" "}
              <Link
                href="/redeem"
                className="underline underline-offset-2 hover:text-[#E8E0D0]"
              >
                twinscene.org/redeem
              </Link>{" "}
              to finish claiming your band&apos;s page.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 text-sm text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
