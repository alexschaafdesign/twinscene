"use client";

// Client-only wrapper around the Leaflet map. react-leaflet / Leaflet reach for
// `window` at import time, so the real map (VenueMapInner) is pulled in with
// ssr: false and never rendered on the server. This file is the seam so
// VenueGrid can import a plain component without worrying about SSR.

import dynamic from "next/dynamic";
import type { Venue } from "@/lib/venueUtils";

const VenueMapInner = dynamic(() => import("./VenueMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-[#E8E0D0]/50">
      Loading map…
    </div>
  ),
});

export default function VenueMap({ venues }: { venues: Venue[] }) {
  return <VenueMapInner venues={venues} />;
}
