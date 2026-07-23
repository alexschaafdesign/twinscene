import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Playlists — Twin Scene",
  description:
    "Playlists spotlighting the Twin Cities music scene, starting with a monthly roundup of new local releases.",
});

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
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Playlists</h1>
          <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
            Playlists spotlighting the Twin Cities scene. More writing over on{" "}
            <Link href="/reads" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Reads
            </Link>
            .
          </p>
        </div>
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
