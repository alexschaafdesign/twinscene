import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { fetchAdminUsers, type AdminUserRow } from "@/lib/fetchUsers";
import UserAdminToggle from "@/components/UserAdminToggle";

export const metadata: Metadata = {
  title: "Users — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Absolute date + time, e.g. "Jul 18, 2026, 2:40 PM". */
function formatTs(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact relative age, e.g. "3d", "5h", "just now". Null → em dash. */
function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const secs = (Date.now() - new Date(ts).getTime()) / 1000;
  if (secs < 60) return "just now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.floor(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.floor(months)}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** Prefer per-request activity; fall back to last fresh login for old rows. */
function lastActive(u: AdminUserRow): string | null {
  return u.last_seen_at ?? u.last_session_at;
}

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const users = await fetchAdminUsers();
  const adminCount = users.filter((u) => u.is_admin).length;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 text-[#E8E0D0] sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Users</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          {users.length} {users.length === 1 ? "account" : "accounts"} · {adminCount}{" "}
          admin{adminCount === 1 ? "" : "s"}. Newest first. An admin can edit any
          band; you can&apos;t remove your own admin access, or the last
          admin&apos;s.
        </p>
      </header>

      {users.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#E8E0D0]/60">No users yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/20 text-left text-xs uppercase tracking-wide text-[#E8E0D0]/50">
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium">Last active</th>
                <th className="py-2 pr-4 text-right font-medium">Edits</th>
                <th className="py-2 pr-4 text-right font-medium">Claims</th>
                <th className="py-2 pr-4 text-right font-medium">Follows</th>
                <th className="py-2 text-right font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[#E8E0D0]/10 align-top"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.name ?? u.email}</span>
                      {u.is_admin && (
                        <span className="rounded bg-[#E8E0D0]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#E8E0D0]/80">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#E8E0D0]/50">
                      {u.email}
                      {u.username && ` · @${u.username}`}
                    </div>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-[#E8E0D0]/70">
                    <span title={formatTs(u.created_at)}>
                      {timeAgo(u.created_at)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-[#E8E0D0]/70">
                    {(() => {
                      const active = lastActive(u);
                      return (
                        <span title={active ? formatTs(active) : "Never signed in"}>
                          {timeAgo(active)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-[#E8E0D0]/70">
                    {u.editor_count || "—"}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-[#E8E0D0]/70">
                    {u.claim_count || "—"}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-[#E8E0D0]/70">
                    {u.follow_count || "—"}
                  </td>
                  <td className="py-3 text-right">
                    <UserAdminToggle
                      userId={u.id}
                      initialIsAdmin={u.is_admin}
                      label={u.name ?? u.email}
                      isSelf={Number(u.id) === Number(user.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
