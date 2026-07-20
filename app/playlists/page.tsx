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
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      {/* Visually hidden — every page needs an h1 for accessibility/SEO, but
          there's no search/filter UI to hang it on here (just two static
          embeds), unlike the other directory pages. */}
      <h1 className="sr-only">Playlists — Twin Scene</h1>

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
