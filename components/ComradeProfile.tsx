// Shared comrade profile content — the photo, name/category/city, tagline,
// bio, and contact/links sidebar. Mirrors MediaProProfile.tsx's layout: a
// left sidebar (photo, contact info) and a wider main column (name, bio).

import type { ReactNode } from "react";
import type { Comrade } from "@/lib/comrades";
import { comradeCategoryLabel } from "@/components/comrade-shared";
import { ComradeImage } from "@/components/comrade-shared-client";

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

export default function ComradeProfile({
  comrade,
  actions,
}: {
  comrade: Comrade;
  /** Edit/claim/admin action buttons — the page assembles these but they
   * render inline with the name so the header stays a single row. */
  actions?: ReactNode;
}) {
  const instagramHandle = comrade.instagram?.replace(/^@/, "").trim();

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      {/* Photo — sidebar, top */}
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        <ComradeImage comrade={comrade} className="rounded-md ring-1 ring-[#E8E0D0]/10" />
      </div>

      {/* Main content — name, category/city, tagline, bio */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
              {comrade.name}
            </h1>
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
          {comrade.city && (
            <p className="mt-2 truncate text-sm text-[#E8E0D0]/55">{comrade.city}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/75">
              {comradeCategoryLabel(comrade.category)}
            </span>
          </div>
          {comrade.tagline && (
            <p className="mt-4 break-words text-base leading-relaxed text-[#E8E0D0]/90">
              {comrade.tagline}
            </p>
          )}
        </div>

        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#E8E0D0]/85">
          {comrade.bio || "No bio yet."}
        </p>

        {/* Portfolio gallery — only photo/video listings carry one. */}
        {comrade.gallery.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Gallery
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {comrade.gallery.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square overflow-hidden rounded-md ring-1 ring-[#E8E0D0]/10 transition hover:ring-[#E8E0D0]/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- photo comes from R2, an arbitrary external host */}
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar extras — directly under the photo */}
      <div className="space-y-5 md:col-start-1 md:row-start-2">
        <InfoBlock label="Contact" value={comrade.contact ?? ""} />
        <InfoBlock
          label="Portfolio"
          value={comrade.portfolio_url ?? ""}
          href={comrade.portfolio_url ? ensureUrl(comrade.portfolio_url) : undefined}
        />
        <InfoBlock
          label="Website"
          value={comrade.website ?? ""}
          href={comrade.website ? ensureUrl(comrade.website) : undefined}
        />
        <InfoBlock
          label="Instagram"
          value={comrade.instagram ?? ""}
          href={instagramHandle ? `https://instagram.com/${instagramHandle}` : undefined}
        />
      </div>
    </div>
  );
}
