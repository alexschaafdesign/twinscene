// The band profile's grid geometry, in one place.
//
// Two callers render it: BandProfile (server, the normal read-only view) and
// ProfileLayoutEditor (client, the in-place layout editor). Keeping the grid
// here means the editing view can't visually drift from the real page — you're
// arranging the actual profile, not a preview of it.
//
// Deliberately has no "use client" directive: it's pure markup with no
// server-only dependencies, so it works in either graph (importing it from the
// client editor simply bundles it as client code).
//
// Layout: a left sidebar (photo on top, sidebar sections beneath) and a wider
// main column that spans both sidebar rows, so name → bio → shows flow tight
// from the top regardless of the photo's height. Falls back to a single
// readable column on mobile.

import type { ReactNode } from "react";

export default function BandProfileShell({
  photo,
  header,
  main,
  sidebar,
}: {
  photo: ReactNode;
  /** Name, actions, location and genres — pinned above the main column's
   * sections and never part of the arrangeable set. */
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10">
      <div className="mx-auto w-full max-w-sm md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
        {photo}
      </div>

      {/* data-region marks the two drop containers. The layout editor finds
          them (and the data-section rows inside) by query rather than by ref,
          which keeps this component ref-free and usable from both graphs. */}
      <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
        {header}
        <div data-region="main" className="space-y-6">
          {main}
        </div>
      </div>

      <div data-region="sidebar" className="space-y-5 md:col-start-1 md:row-start-2">
        {sidebar}
      </div>
    </div>
  );
}
