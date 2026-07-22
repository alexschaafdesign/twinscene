"use client";

// The actual Leaflet map. Loaded ONLY through VenueMap's dynamic({ ssr: false })
// import — Leaflet touches `window` at module scope, so it must never render on
// the server. Tiles are CARTO's "Dark Matter" basemap (keyless, like the
// Census geocoder): roads/labels recede into a muted dark palette so the venue
// pins carry the emphasis and it sits inside the app's dark theme.
//
// Two kinds of pin: EXACT (solid pill + downward beak at the geocoded point)
// and APPROXIMATE (dashed pill, "≈" prefix, centered on the venue's
// neighborhood centroid) for venues that publish no street address but a known
// neighborhood.

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import type { Venue } from "@/lib/venueUtils";
import { hueForSlug, autoInitials } from "@/lib/venueColor";

// Twin Cities center — the fallback view when no venues have coordinates yet.
const TWIN_CITIES: [number, number] = [44.965, -93.15];

// A venue resolved to a drawable point, plus whether that point is exact (a
// geocoded address) or approximate (its neighborhood's centroid).
type MapPoint = { venue: Venue; lat: number; lng: number; approximate: boolean };
// ...plus the coordinates we actually draw it at (dLat/dLng), which differ from
// lat/lng only when it was fanned out of an overlapping cluster below.
type PlacedPoint = MapPoint & { dLat: number; dLng: number };

// Fan radius (~65m) for points that share a coordinate — First Avenue and 7th
// St Entry occupy the same building; several DIY venues can share a
// neighborhood centroid — so both/all stay visible and clickable.
const OVERLAP_RADIUS = 0.0006;

/** Nudge points that share a coordinate onto a small circle so every pin is
 * visible and clickable instead of stacking invisibly on top of each other. */
function spreadOverlaps(points: MapPoint[]): PlacedPoint[] {
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  const placed: PlacedPoint[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const p = group[0];
      placed.push({ ...p, dLat: p.lat, dLng: p.lng });
      continue;
    }
    // Longitude degrees are shorter than latitude degrees this far north;
    // scale the horizontal offset so the fan reads as a circle, not an ellipse.
    const lngScale = 1 / Math.cos((group[0].lat * Math.PI) / 180);
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      placed.push({
        ...p,
        dLat: p.lat + OVERLAP_RADIUS * Math.sin(angle),
        dLng: p.lng + OVERLAP_RADIUS * Math.cos(angle) * lngScale,
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
 * per-slug hue so the map reads as the same directory. Exact pins get a solid
 * fill and a downward beak at the point; approximate pins get a dashed border
 * and an "≈" prefix, centered on the neighborhood. Built as an L.divIcon so
 * there are no marker image assets to configure. */
function pinIcon(point: MapPoint): L.DivIcon {
  const { venue, approximate } = point;
  const hue = hueForSlug(venue.slug);
  const label = escapeHtml(pinLabel(venue));
  const display = approximate ? `≈&nbsp;${label}` : label;
  // Approximate the rendered width so Leaflet's marker box matches the pill
  // (keeps hit-testing and centering correct). Generous per-char estimate +
  // padding so real labels never clip; the ellipsis is only a safety net.
  const charCount = approximate ? label.length + 2 : label.length;
  const width = Math.max(34, Math.round(charCount * 8) + 20);

  const inner = (borderStyle: string, weight: number) =>
    `display:flex;align-items:center;justify-content:center;
     width:100%;height:${PILL_HEIGHT}px;box-sizing:border-box;padding:0 9px;
     border-radius:7px;border:2px ${borderStyle} #F5EFE2;
     box-shadow:0 2px 8px rgba(0,0,0,0.5);
     color:#fff;font:${weight} 12px/1 system-ui,sans-serif;
     text-shadow:0 1px 1px rgba(0,0,0,0.35);`;

  if (approximate) {
    // Dashed, slightly translucent, centered on the neighborhood — no beak,
    // since there's no exact spot to point at.
    return L.divIcon({
      className: "",
      html: `<div style="${inner("dashed", 600)}background:hsl(${hue} 50% 45% / 0.82);">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${display}</span>
      </div>`,
      iconSize: [width, PILL_HEIGHT],
      iconAnchor: [width / 2, PILL_HEIGHT / 2],
      popupAnchor: [0, -(PILL_HEIGHT / 2) - 4],
    });
  }

  const height = PILL_HEIGHT + BEAK_HEIGHT;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:100%;height:100%;">
      <div style="${inner("solid", 700)}background:hsl(${hue} 60% 50%);">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${display}</span>
      </div>
      <span style="
        position:absolute;left:50%;top:${PILL_HEIGHT}px;transform:translateX(-50%);
        width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:${BEAK_HEIGHT}px solid hsl(${hue} 60% 50%);
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
  // Place each venue at its exact coords when we have them, otherwise at its
  // neighborhood centroid (approximate); skip venues with neither. Then fan out
  // any that share a coordinate so none hide beneath another.
  const placed = useMemo(() => {
    const points: MapPoint[] = [];
    for (const v of venues) {
      if (v.lat != null && v.lng != null) {
        points.push({ venue: v, lat: v.lat, lng: v.lng, approximate: false });
      } else if (v.approxLat != null && v.approxLng != null) {
        points.push({ venue: v, lat: v.approxLat, lng: v.approxLng, approximate: true });
      }
    }
    return spreadOverlaps(points);
  }, [venues]);

  const points = useMemo<[number, number][]>(
    () => placed.map((p) => [p.dLat, p.dLng]),
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
      {placed.map((point) => (
        <Marker
          key={point.venue.slug}
          position={[point.dLat, point.dLng]}
          icon={pinIcon(point)}
        >
          <Popup>
            <Link
              href={`/venues/${point.venue.slug}`}
              className="font-semibold text-[#2A2420]"
            >
              {point.venue.shortName || point.venue.name}
            </Link>
            {point.approximate ? (
              <div className="mt-0.5 text-xs text-[#2A2420]/70">
                Approximate
                {point.venue.neighborhood ? ` · ${point.venue.neighborhood}` : ""}
              </div>
            ) : (
              (point.venue.neighborhood || point.venue.city) && (
                <div className="mt-0.5 text-xs text-[#2A2420]/70">
                  {[point.venue.neighborhood, point.venue.city]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
