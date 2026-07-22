"use client";

import { useState } from "react";

/** A lightweight YouTube embed: shows the poster thumbnail with a play button
 * and only mounts the real (heavy) iframe once clicked. Lets a page render many
 * videos — e.g. a show lineup with two clips per band — without paying for a
 * pile of iframes on first paint. */
export default function LiteYoutube({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [active, setActive] = useState(false);

  if (active) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          title={title}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          className="h-full w-full border-0"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      aria-label={`Play video: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-md bg-black"
    >
      {/* YouTube's poster. hqdefault always exists (unlike maxres). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        loading="lazy"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/10">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 transition group-hover:bg-[#E8B84B]">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="ml-0.5 h-5 w-5 text-white transition group-hover:text-[#2A2420]"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
