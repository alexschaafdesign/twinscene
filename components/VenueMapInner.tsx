"use client";

// The actual Leaflet map. Loaded ONLY through VenueMap's dynamic({ ssr: false })
// import — Leaflet touches `window` at module scope, so it must never render on
// the server. Tiles are CARTO's "Dark Matter" basemap (keyless, like the
// Census geocoder): roads/labels recede into a muted dark palette so the venue
// pins carry the emphasis and it sits inside the app's dark theme.

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
// A venue plus the coordinates we actually draw it at (dLat/dLng), which differ
// from lat/lng only when it was fanned out of an overlapping cluster below.
type PlacedVenue = MappableVenue & { dLat: number; dLng: number };

// Fan radius (~65m) for venues that share an address, e.g. First Avenue and
// 7th St Entry occupy the same building and geocode to the identical point.
const OVERLAP_RADIUS = 0.0006;

/** Nudge venues that share a coordinate onto a small circle so every pin is
 * visible and clickable instead of stacking invisibly on top of each other. */
function spreadOverlaps(venues: MappableVenue[]): PlacedVenue[] {
  const groups = new Map<string, MappableVenue[]>();
  for (const v of venues) {
    const key = `${v.lat.toFixed(5)},${v.lng.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(v);
    else groups.set(key, [v]);
  }

  const placed: PlacedVenue[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const v = group[0];
      placed.push({ ...v, dLat: v.lat, dLng: v.lng });
      continue;
    }
    // Longitude degrees are shorter than latitude degrees this far north;
    // scale the horizontal offset so the fan reads as a circle, not an ellipse.
    const lngScale = 1 / Math.cos((group[0].lat * Math.PI) / 180);
    group.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      placed.push({
        ...v,
        dLat: v.lat + OVERLAP_RADIUS * Math.sin(angle),
        dLng: v.lng + OVERLAP_RADIUS * Math.cos(angle) * lngScale,
      });
    });
  }
  return placed;
}

/** Compact 1-3 char label for a pin. Venues can carry a wordy avatar label
 * (e.g. "Acadia") that overflows a pin, so anything longer falls back to the
 * always-short auto-initials ("AC"). */
function pinLabel(venue: Venue): string {
  const raw = venue.avatarInitials || autoInitials(venue.name);
  return raw.length <= 3 ? raw : autoInitials(venue.name);
}

/** A colored teardrop pin with the venue's initials, mirroring VenueAvatar's
 * per-slug hue so the map reads as the same directory. Built as an L.divIcon
 * so there are no marker image assets to configure. */
function pinIcon(venue: MappableVenue): L.DivIcon {
  const hue = hueForSlug(venue.slug);
  return L.divIcon({
    className: "", // drop Leaflet's default styling; we bring our own
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:38px;height:38px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:hsl(${hue} 60% 50%);
      border:3px solid #F5EFE2;
      box-shadow:0 2px 8px rgba(0,0,0,0.55);
    "><span style="
      transform:rotate(45deg);
      color:#fff;font:700 13px/1 system-ui,sans-serif;
      text-shadow:0 1px 1px rgba(0,0,0,0.35);
    ">${pinLabel(venue)}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38], // tip of the teardrop
    popupAnchor: [0, -36],
  });
}

/** Fit the map to the current markers whenever the placed set changes. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function VenueMapInner({ venues }: { venues: Venue[] }) {
  // Only venues we actually have coordinates for can be placed; then fan out
  // any that share an address so none hide beneath another.
  const placed = useMemo(() => {
    const mappable = venues.filter(
      (v): v is MappableVenue => v.lat != null && v.lng != null,
    );
    return spreadOverlaps(mappable);
  }, [venues]);

  const points = useMemo<[number, number][]>(
    () => placed.map((v) => [v.dLat, v.dLng]),
    [placed],
  );

  return (
    <MapContainer
      center={TWIN_CITIES}
      zoom={12}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "#12100d" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <FitBounds points={points} />
      {placed.map((venue) => (
        <Marker key={venue.slug} position={[venue.dLat, venue.dLng]} icon={pinIcon(venue)}>
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
