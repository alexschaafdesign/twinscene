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
