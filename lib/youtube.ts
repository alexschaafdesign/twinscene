// Shared YouTube URL helpers — used both server-side (validating/normalizing a
// submitted URL, lib/videos.ts) and client-side (embedding a video, BandProfile).

const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/(?:embed|shorts)\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
];

/** Extract the 11-char video id from any common YouTube URL shape, or null. */
export function parseYoutubeId(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function isYoutubeUrl(url: string): boolean {
  return parseYoutubeId(url) !== null;
}
