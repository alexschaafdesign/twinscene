import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserByUsername, type PublicProfileUser } from "@/lib/users";
import { listFollowedBands } from "@/lib/bandFollows";
import { listAttended, getAttendedStats } from "@/lib/showSaves";
import Link from "next/link";
import { formatShowDate } from "@/components/band-shared";
import { formatStatusAge } from "@/components/statusTime";

type Props = {
  params: Promise<{ username: string }>;
};

export const dynamic = "force-dynamic";

function displayName(user: PublicProfileUser): string {
  return user.name?.trim() || `@${user.username}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profileUser = await getUserByUsername(username);
  if (!profileUser) return {};

  const title = `${displayName(profileUser)} — Twin Scene`;

  // Private profiles never get indexed, regardless of who's viewing — the
  // owner's own "private preview" of their page shouldn't show up in search
  // results either.
  if (!profileUser.profile_public) {
    return { title, robots: { index: false, follow: false } };
  }

  return {
    title,
    description:
      (profileUser.show_bio && profileUser.bio) || `${displayName(profileUser)} on Twin Scene.`,
  };
}

// Public, unauthenticated profile page — followed bands, shows attended, and
// stats for a user, gated by users.profile_public (see migration 0020). The
// underlying lookup (lib/users.ts#getUserByUsername) selects an explicit
// column list that never includes email, so nothing here can leak it. Shows
// come from listAttended/getAttendedStats (lib/showSaves.ts), which are
// scoped to status = 'went' only — 'interested'/'going' (future plans) never
// enter these queries, so they can't appear on a public profile.
export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const profileUser = await getUserByUsername(username);
  if (!profileUser) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === profileUser.id;

  // The owner always sees their own sections when previewing this page — the
  // toggles only affect what OTHER visitors get — with a note flagging which
  // ones are currently hidden from everyone else.
  const canSeeBio = isOwner || profileUser.show_bio;
  const canSeeStatus = isOwner || profileUser.show_status;
  const canSeeFollows = isOwner || profileUser.show_followed_bands;
  const canSeeAttended = isOwner || profileUser.show_attended_shows;

  const initial = (profileUser.name?.trim()?.[0] || profileUser.username[0] || "?").toUpperCase();

  if (!profileUser.profile_public && !isOwner) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-5 py-24 text-center text-[#E8E0D0] sm:px-8">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-lg font-medium text-[#E8E0D0]">
          {profileUser.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileUser.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </div>
        <p className="text-lg font-medium">{displayName(profileUser)}</p>
        <p className="text-sm text-[#E8E0D0]/60">@{profileUser.username}</p>
        <p className="mt-2 text-sm text-[#E8E0D0]/50">This profile is private.</p>
      </main>
    );
  }

  const [followedBands, attendedShows, stats] = await Promise.all([
    listFollowedBands(profileUser.id),
    listAttended(profileUser.id),
    getAttendedStats(profileUser.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 py-24 text-[#E8E0D0] sm:px-8">
      {!profileUser.profile_public && isOwner && (
        <p className="rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-xs text-[#E8E0D0]/60">
          Private — only you can see this.
        </p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-lg font-medium text-[#E8E0D0]">
          {profileUser.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileUser.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{displayName(profileUser)}</p>
          <p className="text-sm text-[#E8E0D0]/60">@{profileUser.username}</p>
          {canSeeBio && profileUser.bio && (
            <p className="mt-1 text-sm text-[#E8E0D0]/80">
              {profileUser.bio}
              {isOwner && !profileUser.show_bio && (
                <span className="ml-2 text-xs text-[#E8B84B]/80">(hidden from your public profile)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {canSeeStatus && profileUser.status && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] px-5 py-4 text-base text-[#E8E0D0]">
          <span>
            <span className="text-[#E8E0D0]/50">{displayName(profileUser)} is</span> {profileUser.status}
          </span>
          <span className="flex items-center gap-2">
            {profileUser.status_at && (
              <span className="text-xs text-[#E8E0D0]/40">{formatStatusAge(profileUser.status_at)}</span>
            )}
            {isOwner && !profileUser.show_status && (
              <span className="text-xs text-[#E8B84B]/80">(hidden from your public profile)</span>
            )}
          </span>
        </div>
      )}

      {canSeeFollows && (
        <div>
          <h2 className="text-xl font-medium">Bands they follow</h2>
          {isOwner && !profileUser.show_followed_bands && (
            <p className="mt-1 text-xs text-[#E8B84B]/80">Hidden from your public profile — only you can see this here.</p>
          )}
          {followedBands.length === 0 ? (
            <p className="mt-4 text-sm text-[#E8E0D0]/50">Not following any bands yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {followedBands.map((b) => (
                <li
                  key={b.band_id}
                  className="rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
                >
                  <Link href={`/bands/${b.slug}`} className="hover:underline">
                    {b.name}
                    {b.city && <span className="text-[#E8E0D0]/50"> — {b.city}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canSeeAttended && (
        <>
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-medium">{stats.total}</p>
              <p className="text-sm text-[#E8E0D0]/60">Shows attended</p>
            </div>
            <div>
              <p className="text-2xl font-medium">{stats.thisYear}</p>
              <p className="text-sm text-[#E8E0D0]/60">This year</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-medium">Shows attended</h2>
            {isOwner && !profileUser.show_attended_shows && (
              <p className="mt-1 text-xs text-[#E8B84B]/80">Hidden from your public profile — only you can see this here.</p>
            )}
            {attendedShows.length === 0 ? (
              <p className="mt-4 text-sm text-[#E8E0D0]/50">No shows attended yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {attendedShows.map((s) => (
                  <li
                    key={s.show_id}
                    className="rounded-md border border-[#E8E0D0]/15 px-3.5 py-2 text-sm"
                  >
                    <span className="font-medium text-[#E8E0D0]">{formatShowDate(s.date)}</span>
                    <span className="text-[#E8E0D0]/50"> — {s.title}</span>
                    {s.venue_name && <span className="text-[#E8E0D0]/50"> ({s.venue_name})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
