import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical (flyingv.ts) depends on temporal-polyfill, which defines BigInt
  // constants at module scope; Next's default server-bundling transform
  // mangles that into a runtime helper that has no BigInt, throwing "e.BigInt
  // is not a function" on import. Opting out of bundling (native require
  // instead) avoids the transform entirely.
  serverExternalPackages: ["node-ical", "temporal-polyfill", "rrule-temporal"],
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
