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

/** The pin's text: the venue's avatar label in full ("Green Room"), or the
 * auto-derived initials ("AC") when no avatar label is set. The pill sizes to
 * fit, so long labels are shown whole rather than truncated. */
function pinLabel(venue: Venue): string {
  return venue.avatarInitials || autoInitials(venue.name);
}

// Basic HTML-escape for the label, since it goes into a divIcon html string.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const PILL_HEIGHT = 26; // px, the rounded label body
const BEAK_HEIGHT = 7; // px, the little downward tail whose tip marks the spot

/** A colored label pill with the venue's avatar title, mirroring VenueAvatar's
 * per-slug hue so the map reads as the same directory. The pill auto-sizes to
 * the label; a downward beak points at the exact location. Built as an
 * L.divIcon so there are no marker image assets to configure. */
function pinIcon(venue: MappableVenue): L.DivIcon {
  const hue = hueForSlug(venue.slug);
  const bg = `hsl(${hue} 60% 50%)`;
  const label = escapeHtml(pinLabel(venue));
  // Approximate the rendered width so Leaflet's marker box matches the pill
  // (keeps hit-testing and centering correct). Generous per-char estimate +
  // padding so real labels never clip; the ellipsis is only a safety net.
  const width = Math.max(34, Math.round(label.length * 8) + 20);
  const height = PILL_HEIGHT + BEAK_HEIGHT;

  return L.divIcon({
    className: "", // drop Leaflet's default styling; we bring our own
    html: `<div style="position:relative;width:100%;height:100%;">
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:100%;height:${PILL_HEIGHT}px;box-sizing:border-box;padding:0 9px;
        border-radius:7px;background:${bg};border:2px solid #F5EFE2;
        box-shadow:0 2px 8px rgba(0,0,0,0.55);
        color:#fff;font:700 12px/1 system-ui,sans-serif;
        text-shadow:0 1px 1px rgba(0,0,0,0.35);
      "><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span></div>
      <span style="
        position:absolute;left:50%;top:${PILL_HEIGHT}px;transform:translateX(-50%);
        width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:${BEAK_HEIGHT}px solid ${bg};
      "></span>
    </div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height], // beak tip marks the location
    popupAnchor: [0, -height + 2],
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
