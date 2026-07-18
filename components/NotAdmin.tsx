// Shown to a signed-in but non-admin user who reaches an admin page. Pages
// redirect signed-OUT users to /login first; this covers the "logged in, wrong
// account" case. A real gate always runs server-side before this renders — it's
// just the message, not the check.
export default function NotAdmin() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <p className="text-sm text-[#F5A3A3]">
        You don&apos;t have access to this page.
      </p>
    </main>
  );
}
