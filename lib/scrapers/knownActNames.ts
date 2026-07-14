// A short, manually-maintained list of real act names whose own punctuation
// (a comma, usually alongside an "&") reads exactly like several
// comma/&-separated acts to the naive delimiter-splitting every title-based
// scraper does - "Earth, Wind & Fire" has no way to distinguish itself from
// "Earth, Wind, and Fire" (three acts) without knowing it's one act's actual
// name. There's no generic fix for that ambiguity, so this just lists the
// known cases verbatim; add to it whenever reviewFlags.ts's dangling-
// connector/duplicate-act checks catch a real one getting fragmented.
export const KNOWN_MULTI_PART_NAMES = [
  "Earth, Wind & Fire",
  "Emerson, Lake & Palmer",
  "Crosby, Stills, Nash & Young",
  "Crosby, Stills & Nash",
  "Blood, Sweat & Tears",
];

const SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/** Escape a string for use as a literal (non-regex) match inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(SPECIAL_CHARS, "\\$&");
}

export type NameProtector = { text: string; restore: (piece: string) => string };

const NUL = String.fromCharCode(0);

/**
 * Swap any KNOWN_MULTI_PART_NAMES occurrence in `text` for a placeholder
 * token (a null byte, the name's index, and another null byte) before a
 * comma/&/and/slash split runs, so the split can't fragment it, then call
 * `restore` on every resulting piece - before trimming it - to swap the
 * token back for the real name.
 *
 * The token deliberately isn't padded with plain spaces: a space-padded
 * token would have those spaces eaten by a *neighboring* delimiter match
 * (e.g. the comma right before it greedily consuming its own trailing
 * whitespace), leaving a bare index with nothing left for restore() to find.
 * A null byte matches none of \s, ",", "&", "and", or "/", so it can never be
 * partially consumed - the whole token always survives as one atomic,
 * contiguous substring, landing intact in whichever piece contains it.
 */
export function protectKnownNames(text: string): NameProtector {
  let working = text;
  const placeholders = new Map<string, string>();

  KNOWN_MULTI_PART_NAMES.forEach((name, i) => {
    const re = new RegExp(escapeRegExp(name), "gi");
    if (re.test(working)) {
      const token = NUL + i + NUL;
      placeholders.set(token, name);
      working = working.replace(re, token);
    }
  });

  if (placeholders.size === 0) {
    return { text: working, restore: (piece) => piece };
  }
  return {
    text: working,
    restore: (piece) => {
      let result = piece;
      for (const [token, name] of placeholders) {
        result = result.split(token).join(name);
      }
      return result;
    },
  };
}
