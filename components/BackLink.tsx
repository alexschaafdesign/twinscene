import Link from "next/link";

// Shared "go back up a level" link — for detail pages that hang off a
// directory list (e.g. /venues/[slug] off /venues), so there's an obvious way
// back to the list without relying on the browser back button. Top-level list
// pages themselves don't need one — the persistent SectionNav already shows
// which section you're in. Consistent styling everywhere it's used is the
// point; pass `className` only for spacing (e.g. `mb-8`), not color.
export default function BackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0] ${className}`}
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
