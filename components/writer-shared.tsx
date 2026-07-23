// Small shared bits for the writer surfaces (directory, profile, /reads
// bylines). Kept server-safe (plain markup, no client hooks) so any of those
// server components can import it.

import type { Writer } from "@/lib/writers";

// A writer's round avatar, falling back to their initial on a tinted disc when
// there's no photo. Sized by the caller.
export function WriterAvatar({
  writer,
  className = "",
}: {
  writer: Pick<Writer, "name" | "photo" | "thumbnail_url">;
  className?: string;
}) {
  const src = writer.thumbnail_url ?? writer.photo;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from R2/arbitrary hosts; next/image would need per-domain remotePatterns
      <img
        src={src}
        alt=""
        className={`rounded-full object-cover ring-1 ring-[#E8E0D0]/15 ${className}`}
      />
    );
  }
  return (
    <span
      className={`grid place-items-center rounded-full bg-[#E8E0D0]/10 font-semibold text-[#E8E0D0]/80 ${className}`}
    >
      {writer.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
