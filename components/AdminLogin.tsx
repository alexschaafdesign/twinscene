import { loginAdmin } from "@/app/admin/actions";

/** Password prompt shown on any /admin/* page when the visitor isn't logged in. */
export default function AdminLogin({ error }: { error: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">Crawlspace Admin</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Enter the admin password to continue.
      </p>
      <form action={loginAdmin} className="mt-6 flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          Enter
        </button>
        {error && (
          <p className="text-sm text-[#F5A3A3]">Incorrect password.</p>
        )}
      </form>
    </main>
  );
}
