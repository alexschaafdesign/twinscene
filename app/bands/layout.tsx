// Shared container for the /bands section. For now the directory itself lives at
// the site root; /bands redirects home (page.tsx) and /bands/[slug] renders a
// profile with its own back/edit bar, so the layout only provides the shell.
export default function BandsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      {children}
    </main>
  );
}
