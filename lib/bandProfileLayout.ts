// Section ordering/visibility for band profiles.
//
// A band profile is assembled from named sections placed into two regions
// ("main" — the wide column, "sidebar" — the narrow one under the photo).
// This module owns the vocabulary of section ids, the default arrangement,
// and the normalizer that turns whatever is stored on the row into a layout
// the renderer can trust. The rendering itself (and the JSX for each section)
// lives in components/BandProfile.tsx.
//
// Nothing persists a layout yet — every profile renders DEFAULT_LAYOUT. This
// exists so the renderer is already driven by data when a `profile_layout`
// column lands.

export type SectionId =
  | "bio"
  | "members"
  | "memberClaims"
  | "claimEntry"
  | "featured"
  | "music"
  | "videos"
  | "shows"
  | "links"
  | "contact";

export type Region = "main" | "sidebar";

export type BandProfileLayout = {
  main: SectionId[];
  sidebar: SectionId[];
  /** Sections the band has turned off. Pinned sections can never land here. */
  hidden: SectionId[];
};

type SectionMeta = {
  /** Label for the (future) customizer UI. */
  label: string;
  /**
   * Pinned sections aren't the band's to arrange — they're moderation and
   * claim UI whose placement is a product decision (pending member requests,
   * the "are you in this band?" prompt). They're part of the order so they
   * keep their spot in the flow, but the customizer never offers them and
   * normalizeLayout always restores them.
   */
  pinned?: true;
};

export const SECTION_META: Record<SectionId, SectionMeta> = {
  bio: { label: "Bio" },
  members: { label: "Members" },
  memberClaims: { label: "Pending member requests", pinned: true },
  claimEntry: { label: "Member request prompt", pinned: true },
  featured: { label: "Featured links" },
  music: { label: "Music" },
  videos: { label: "Videos" },
  shows: { label: "Upcoming shows" },
  links: { label: "Social links" },
  contact: { label: "Contact" },
};

/** The arrangement every profile rendered before layouts were configurable. */
export const DEFAULT_LAYOUT: BandProfileLayout = {
  main: [
    "bio",
    "members",
    "memberClaims",
    "claimEntry",
    "featured",
    "music",
    "videos",
    "shows",
  ],
  sidebar: ["links", "contact"],
  hidden: [],
};

export const REGIONS: Region[] = ["main", "sidebar"];

function isSectionId(v: unknown): v is SectionId {
  return typeof v === "string" && v in SECTION_META;
}

/** Known section ids from an untrusted array, in order, junk dropped. */
function sectionIds(v: unknown): SectionId[] {
  return Array.isArray(v) ? v.filter(isSectionId) : [];
}

/**
 * Turn a stored (or missing, or stale) layout into one the renderer can use.
 *
 * Self-healing by design: a section the stored config doesn't mention — a new
 * one we shipped after the band last customized, or a pinned one a stale
 * config dropped — is re-inserted at its default slot rather than silently
 * vanishing. Only an explicit `hidden` entry hides a section, so adding to
 * SECTION_META never requires a data migration.
 */
export function normalizeLayout(raw: unknown): BandProfileLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const stored = raw as Partial<Record<keyof BandProfileLayout, unknown>>;

  const hidden = new Set(
    sectionIds(stored.hidden).filter((id) => !SECTION_META[id].pinned),
  );

  const placed = new Set<SectionId>();
  const layout: BandProfileLayout = { main: [], sidebar: [], hidden: [] };

  for (const region of REGIONS) {
    for (const id of sectionIds(stored[region])) {
      if (placed.has(id) || hidden.has(id)) continue;
      placed.add(id);
      layout[region].push(id);
    }
  }

  // Anything still unaccounted for goes back next to the neighbour it sits
  // after by default — not at its raw default index, which would shove the
  // sections a partial config *did* specify out of the order it asked for.
  for (const region of REGIONS) {
    DEFAULT_LAYOUT[region].forEach((id, i) => {
      if (placed.has(id) || hidden.has(id)) return;
      placed.add(id);
      const preceding = DEFAULT_LAYOUT[region].slice(0, i);
      let at = 0;
      for (let j = preceding.length - 1; j >= 0; j--) {
        const found = layout[region].indexOf(preceding[j]);
        if (found !== -1) {
          at = found + 1;
          break;
        }
      }
      layout[region].splice(at, 0, id);
    });
  }

  layout.hidden = [...hidden];
  return layout;
}
