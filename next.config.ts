import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical (flyingv.ts) depends on temporal-polyfill, which defines BigInt
  // constants at module scope; Next's default server-bundling transform
  // mangles that into a runtime helper that has no BigInt, throwing "e.BigInt
  // is not a function" on import. Opting out of bundling (native require
  // instead) avoids the transform entirely.
  // sharp is a native module (libvips bindings). We call it directly in the
  // band-photo upload route (lib/r2.ts thumbnail generation) — not through
  // next/image — so it must not be bundled by the server transform; require it
  // natively instead, same as the other native/ESM-fussy packages here.
  serverExternalPackages: ["node-ical", "temporal-polyfill", "rrule-temporal", "sharp"],
  async redirects() {
    // The standalone Photo/Video directory (media_pros) was folded into
    // Comrades as a category — slugs were preserved in the 0065 migration, so
    // every old /photo-video URL maps 1:1 to its /comrades counterpart.
    // Permanent (308) since these were public, link-previewed pages.
    return [
      { source: "/photo-video", destination: "/comrades", permanent: true },
      { source: "/photo-video/submit", destination: "/comrades/submit", permanent: true },
      { source: "/photo-video/:slug", destination: "/comrades/:slug", permanent: true },
      // The old "link yourself to a photo/video profile" page — claiming now
      // happens from the listing page itself, same as every other comrade.
      { source: "/profile/media-pro", destination: "/comrades", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // The band-profile drawer embeds a Bandcamp player and band videos
        // (YouTube), and /playlists embeds an Apple Music playlist, each in
        // an <iframe>. The app has no other Content-Security-Policy, so this
        // sets only frame-src — every other resource type stays unrestricted
        // (no default-src). 'self' keeps any first-party frames working.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://bandcamp.com https://*.bandcamp.com https://embed.music.apple.com https://www.youtube.com https://youtube.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
