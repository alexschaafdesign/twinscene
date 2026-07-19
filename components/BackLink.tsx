import Link from "next/link";

// Shared "go back up a level" link — every page that isn't the home directory
// itself should have one of these pointing at wherever it hangs off of, so
// there's always an obvious way out. Consistent styling everywhere it's used
// is the point; pass `className` only for spacing (e.g. `mb-8`), not color.
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
