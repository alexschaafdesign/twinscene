import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFollowedBands } from "@/lib/bandFollows";
import { listUpcomingForUser, listAttended } from "@/lib/showSaves";
import { getMusicianForUser } from "@/lib/musicians";
import { listPendingClaimsForUser, listPendingClaimsForOwner } from "@/lib/bandMemberClaims";
import { listOwnedBands } from "@/lib/bandOwnership";
import FollowedBandsList from "@/components/FollowedBandsList";
import UpcomingShowsList from "@/components/UpcomingShowsList";
import AttendedShowsList from "@/components/AttendedShowsList";
import BandMemberClaimsManager from "@/components/BandMemberClaimsManager";
import StatusEditor from "@/components/StatusEditor";

export const metadata: Metadata = {
  title: "My profile — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Logged-in-only profile page — followed bands (the heart; saved+follow were
// merged in migration 0028) plus show attendance.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/profile");
  }

  const [followedBands, upcomingShows, attendedShows, musician, ownedBands, pendingClaims] =
    await Promise.all([
      listFollowedBands(user.id),
      listUpcomingForUser(user.id),
      listAttended(user.id),
      getMusicianForUser(user.id),
      listOwnedBands(user.id),
      listPendingClaimsForUser(user.id),
    ]);
  const ownerPendingClaims = ownedBands.length > 0 ? await listPendingClaimsForOwner(user.id) : [];

  const initial = (user.name?.trim()?.[0] || user.email[0] || "?").toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 py-24 text-[#E8E0D0] sm:px-8">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 text-lg font-medium text-[#E8E0D0]">
          {user.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{user.name || user.email}</p>
          {user.username && <p className="text-sm text-[#E8E0D0]/60">@{user.username}</p>}
          {user.bio && <p className="mt-1 text-sm text-[#E8E0D0]/80">{user.bio}</p>}
          <div className="mt-2">
            <StatusEditor
              name={user.name?.trim() || user.username || "You"}
              initialStatus={user.status}
              initialStatusAt={user.status_at}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/profile/edit"
              className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
            >
              Edit profile
            </Link>
            {user.username ? (
              <Link
                href={`/u/${user.username}`}
                className="text-sm text-[#E8E0D0]/60 underline underline-offset-2 transition hover:text-[#E8E0D0]"
              >
                View your public profile
              </Link>
            ) : (
              <span className="text-sm text-[#E8E0D0]/40">
                Set a username to get a public profile
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-medium">Musician profile</h2>
        {musician ? (
          <p className="mt-2 text-sm text-[#E8E0D0]/70">
            You&apos;re linked to <strong>{musician.name}</strong>.
            {musician.bands.length > 0 ? (
              <>
                {" "}
                You can edit:{" "}
                {musician.bands.map((b, i) => (
                  <span key={b.slug}>
                    {i > 0 && ", "}
                    <Link href={`/bands/${b.slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
                      {b.name}
                    </Link>
                  </span>
                ))}
                .
              </>
            ) : (
              " Not a member of any band yet."
            )}{" "}
            <Link href={`/m/${musician.slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
              View / edit your musician page
            </Link>
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#E8E0D0]/60">
            <Link
              href="/profile/musician"
              className="underline underline-offset-2 hover:text-[#E8E0D0]"
            >
              Are you a musician?
            </Link>{" "}
            Claim your listing or create a profile.
          </p>
        )}
        {pendingClaims.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {pendingClaims.map((c) => (
              <li key={c.id} className="text-sm text-[#E8E0D0]/70">
                Your claim for <strong>{c.musician_name}</strong> in{" "}
                <Link href={`/bands/${c.band_slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
                  {c.band_name}
                </Link>{" "}
                is awaiting review.
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-xl font-medium">Bands you own</h2>
        {ownedBands.length > 0 ? (
          <p className="mt-2 text-sm text-[#E8E0D0]/70">
            {ownedBands.map((b, i) => (
              <span key={b.slug}>
                {i > 0 && ", "}
                <Link href={`/bands/${b.slug}`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
                  {b.name}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#E8E0D0]/60">
            <Link href="/profile/band" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Do you have a band?
            </Link>{" "}
            Find it in the directory or add it. Already got a code?{" "}
            <Link href="/redeem" className="underline underline-offset-2 hover:text-[#E8E0D0]">
              Redeem an ownership code
            </Link>
            .
          </p>
        )}
        {ownerPendingClaims.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Pending member requests
            </h3>
            <BandMemberClaimsManager
              initialClaims={ownerPendingClaims}
              decideUrl={(claim) => `/api/bands/${claim.band_slug}/member-claims/${claim.id}`}
            />
          </>
        )}
      </div>

      {/* One list, not two: saved and followed merged in migration 0028.
          Both old anchors (#saved-bands, #follows) point here so existing
          links don't break. */}
      <div id="follows">
        <span id="saved-bands" />
        <h1 className="text-xl font-medium">Bands you follow</h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Bands you&apos;ve hearted. You&apos;ll get a notification when they
          announce a show or update their profile.
        </p>
        <FollowedBandsList initialBands={followedBands} />
      </div>

      <div>
        <h2 className="text-xl font-medium">Shows you&apos;re going to</h2>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Shows you&apos;ve marked interested or going.
        </p>
        <UpcomingShowsList initialShows={upcomingShows} />
      </div>

      <div>
        <h2 className="text-xl font-medium">Shows you&apos;ve been to</h2>
        <p className="mt-2 text-sm text-[#E8E0D0]/60">
          Your show history.
        </p>
        <AttendedShowsList initialShows={attendedShows} />
      </div>
    </main>
  );
}
