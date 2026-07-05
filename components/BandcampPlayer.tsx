// Compact one-click Bandcamp player for a band profile.
//
// Prefers the resolved EmbeddedPlayer iframe (bandcampEmbedUrl, written by the
// Apps Script handler / backfill script). Falls back to a plain link when only
// the raw Bandcamp URL is known — e.g. embed resolution failed or hasn't run
// yet. Renders nothing when the band has no Bandcamp presence at all.

/** Prefix a bare URL with https:// if it has no scheme. */
function ensureUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function BandcampPlayer({
  name,
  bandcamp,
  bandcampEmbedUrl,
  bandcampEmbedHeight,
}: {
  name: string;
  bandcamp: string;
  bandcampEmbedUrl: string;
  bandcampEmbedHeight: number;
}) {
  if (bandcampEmbedUrl) {
    // Height comes from the resolver: 40 for the minimal bar, or the exact value
    // from a pasted iframe snippet. The wrapper's max-height is only a safety net
    // against an unexpectedly large pasted value, not the primary sizing.
    return (
      <div className="max-h-[800px] overflow-y-auto rounded-md">
        <iframe
          title={`${name} on Bandcamp`}
          src={bandcampEmbedUrl}
          seamless
          loading="lazy"
          style={{ border: 0, width: "100%", height: bandcampEmbedHeight }}
        />
      </div>
    );
  }

  // Only link out when the stored value is an actual URL — if a submitter pasted
  // an iframe snippet that failed to resolve, it isn't a usable href.
  if (bandcamp && !bandcamp.includes("<iframe")) {
    return (
      <a
        href={ensureUrl(bandcamp)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md border border-[#E8E0D0]/25 px-3 py-1.5 text-sm text-[#E8E0D0]/85 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0]"
      >
        {/* ti-brand-bandcamp (Tabler) — simple triangle glyph */}
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 16l5-8h11l-5 8z" />
        </svg>
        Listen on Bandcamp
      </a>
    );
  }

  return null;
}
