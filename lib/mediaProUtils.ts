// Pure media-pro helpers with no server-only dependencies, mirroring
// lib/venueUtils.ts's role for venues: lib/mediaPros.ts (the Postgres data
// layer) imports lib/db.ts, which pulls in the `postgres` client — importing
// that chain into a client component would bundle `postgres` into the
// browser. Client components that only need slugify()/the role vocabulary
// import from here instead.

export type MediaProRole = "photographer" | "videographer" | "both";

export const MEDIA_PRO_ROLES: MediaProRole[] = ["photographer", "videographer", "both"];

export function mediaProRoleLabel(role: string): string {
  switch (role) {
    case "videographer":
      return "Videographer";
    case "both":
      return "Photographer / Videographer";
    case "photographer":
    default:
      return "Photographer";
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
