// Shared media-pro profile content — the photo, name/role/city, bio, and
// contact/links sidebar. Mirrors VenueProfile.tsx's layout: a left sidebar
// (photo, contact info) and a wider main column (name, bio).

import type { MediaPro } from "@/lib/mediaPros";
import { mediaProRoleLabel } from "@/components/media-pro-shared";
import { MediaProImage } from "@/components/media-pro-shared-client";

function InfoBlock({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
        {label}
      </h2>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-sm leading-relaxed text-[#E8E0D0]/85 underline underline-offset-2 hover:text-[#E8E0D0]"
        >
          {value}
        </a>
      ) : (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {value}
        </p>
      )}
    </div>
  );
}

function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function MediaProProfile({ mediaPro }: { mediaPro: MediaPro }) {
  const instagramHandle = mediaPro.instagram?.replace(/^@/, "").trim();

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      {/* Photo — sidebar, top */}
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        <MediaProImage mediaPro={mediaPro} className="rounded-md ring-1 ring-[#E8E0D0]/10" />
      </div>

      {/* Main content — name, role/city, bio */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        <div>
          <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
            {mediaPro.name}
          </h1>
          {mediaPro.city && (
            <p className="mt-2 truncate text-sm text-[#E8E0D0]/55">{mediaPro.city}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75">
              {mediaProRoleLabel(mediaPro.role)}
            </span>
          </div>
        </div>

        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {mediaPro.bio || "No bio yet."}
        </p>
      </div>

      {/* Sidebar extras — directly under the photo */}
      <div className="space-y-5 md:col-start-1 md:row-start-2">
        <InfoBlock label="Contact" value={mediaPro.contact ?? ""} />
        <InfoBlock
          label="Portfolio"
          value={mediaPro.portfolio_url ?? ""}
          href={mediaPro.portfolio_url ? ensureUrl(mediaPro.portfolio_url) : undefined}
        />
        <InfoBlock
          label="Website"
          value={mediaPro.website ?? ""}
          href={mediaPro.website ? ensureUrl(mediaPro.website) : undefined}
        />
        <InfoBlock
          label="Instagram"
          value={mediaPro.instagram ?? ""}
          href={instagramHandle ? `https://instagram.com/${instagramHandle}` : undefined}
        />
      </div>
    </div>
  );
}
