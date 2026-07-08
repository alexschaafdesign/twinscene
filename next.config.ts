import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The band-profile drawer embeds a Bandcamp player, and /playlists
        // embeds an Apple Music playlist, each in an <iframe>. The app has no
        // other Content-Security-Policy, so this sets only frame-src — every
        // other resource type stays unrestricted (no default-src). 'self'
        // keeps any first-party frames working.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://bandcamp.com https://*.bandcamp.com https://embed.music.apple.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
