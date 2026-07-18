"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * "Claim this band" entry point for an unclaimed band's page — a prominent
 * button in the page's top bar that opens a dialog. Purely informational — no
 * claim is recorded here. Ownership is verified out of band (Instagram DM),
 * same trust model as the rest of Slice A (lib/bandOwnership.ts): an admin
 * confirms it's really the band, then sends a one-time code the owner redeems
 * at /redeem, which grants edit access.
 */
export default function ClaimOwnershipButton({ loggedIn = false }: { loggedIn?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-[#E8B84B] px-3 py-1.5 text-xs font-semibold text-[#2A2420] shadow-sm transition hover:bg-[#f0c65f]"
      >
        Claim this band
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
              Claim ownership of this band to be able to edit its page.
            </p>

            {/* Logged-out users need an account to redeem the code later.
                Nudge them to make one now (email-only, no password) so the
                long-lived session is already in place when the code arrives —
                rather than getting bounced to login at /redeem days later. */}
            {!loggedIn && (
              <div className="mt-3 rounded-md border border-[#E8B84B]/30 bg-[#E8B84B]/10 p-3">
                <p className="text-sm font-medium text-[#E8E0D0]">
                  First, create your free account
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#E8E0D0]/75">
                  Just your email — no password. You&apos;ll need it to redeem your code.
                </p>
                <Link
                  href={`/login?next=${encodeURIComponent("/redeem")}`}
                  className="mt-2 inline-flex items-center rounded-md bg-[#E8B84B] px-3 py-1.5 text-xs font-semibold text-[#2A2420] transition hover:bg-[#f0c65f]"
                >
                  Sign in or create account
                </Link>
              </div>
            )}

            <p className="mt-3 text-sm leading-relaxed text-[#E8E0D0]/75">
              {loggedIn ? "Send" : "Then, send"} a DM to{" "}
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
    </>
  );
}
