"use client";

// The actual Leaflet map. Loaded ONLY through VenueMap's dynamic({ ssr: false })
// import — Leaflet touches `window` at module scope, so it must never render on
// the server. Uses free OpenStreetMap raster tiles (no API key), matching the
// keyless-geocoder approach the rest of the app already takes.

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import type { Venue } from "@/lib/venueUtils";
import { hueForSlug, autoInitials } from "@/lib/venueColor";

// Twin Cities center — the fallback view when no venues have coordinates yet.
const TWIN_CITIES: [number, number] = [44.965, -93.15];

type MappableVenue = Venue & { lat: number; lng: number };

/** A small colored pin with the venue's initials, mirroring VenueAvatar's
 * per-slug hue so the map reads as the same directory. Built as an L.divIcon
 * so there are no marker image assets to configure. */
function pinIcon(venue: MappableVenue): L.DivIcon {
  const hue = hueForSlug(venue.slug);
  const label = venue.avatarInitials || autoInitials(venue.name);
  return L.divIcon({
    className: "", // drop Leaflet's default styling; we bring our own
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:hsl(${hue} 45% 45%);
      border:2px solid #E8E0D0;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "><span style="
      transform:rotate(45deg);
      color:#fff;font:600 10px/1 system-ui,sans-serif;
    ">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28], // tip of the teardrop
    popupAnchor: [0, -28],
  });
}

/** Fit the map to the current markers whenever the filtered set changes. */
function FitBounds({ venues }: { venues: MappableVenue[] }) {
  const map = useMap();
  useEffect(() => {
    if (venues.length === 0) return;
    const bounds = L.latLngBounds(venues.map((v) => [v.lat, v.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, venues]);
  return null;
}

export default function VenueMapInner({ venues }: { venues: Venue[] }) {
  // Only venues we actually have coordinates for can be placed.
  const mappable = useMemo(
    () =>
      venues.filter(
        (v): v is MappableVenue => v.lat != null && v.lng != null,
      ),
    [venues],
  );

  return (
    <MapContainer
      center={TWIN_CITIES}
      zoom={12}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "#1b1712" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds venues={mappable} />
      {mappable.map((venue) => (
        <Marker key={venue.slug} position={[venue.lat, venue.lng]} icon={pinIcon(venue)}>
          <Popup>
            <Link href={`/venues/${venue.slug}`} className="font-semibold text-[#2A2420]">
              {venue.shortName || venue.name}
            </Link>
            {(venue.neighborhood || venue.city) && (
              <div className="mt-0.5 text-xs text-[#2A2420]/70">
                {[venue.neighborhood, venue.city].filter(Boolean).join(", ")}
              </div>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
