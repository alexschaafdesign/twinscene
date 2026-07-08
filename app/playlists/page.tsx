import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playlists — Twin Scene",
  description:
    "Playlists spotlighting the Twin Cities music scene, starting with a monthly roundup of new local releases.",
};

type Playlist = {
  credit: string;
  embedUrl: string;
};

const PLAYLISTS: Playlist[] = [
  {
    credit:
      "Monthly playlist of new local releases — thanks to Beemer for maintaining this one!",
    embedUrl:
      "https://embed.music.apple.com/us/playlist/new-local-music-vol-42/pl.u-xrMWXskG5eWv",
  },
  {
    credit:
      "A collection of every local band that has played the Birdhaus, a DIY space in South Minneapolis",
    embedUrl:
      "https://embed.music.apple.com/us/playlist/haus-music-twin-cities-playlist/pl.u-LxJjIx6WpoB",
  },
];

export default function PlaylistsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
        >
          <span aria-hidden>←</span> Directory
        </Link>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Playlists
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          A collection of great playlists capturing the local scene.
        </p>
      </header>

      <div className="space-y-10">
        {PLAYLISTS.map((playlist) => (
          <div key={playlist.embedUrl}>
            <p className="mb-3 text-sm text-[#E8E0D0]/70">
              {playlist.credit}
            </p>
            <iframe
              allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
              height="450"
              style={{
                width: "100%",
                maxWidth: 660,
                overflow: "hidden",
                borderRadius: 10,
              }}
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
              src={playlist.embedUrl}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
