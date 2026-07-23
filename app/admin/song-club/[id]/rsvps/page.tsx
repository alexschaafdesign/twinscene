import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getEventById } from "@/lib/songClub";
import { getRsvpsForEvent } from "@/lib/songClubRsvps";

export const metadata: Metadata = {
  title: "RSVPs — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SongClubRsvpsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8 text-[#E8E0D0] sm:px-8">
        <p className="text-sm text-[#F5A3A3]">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const id = Number((await params).id);
  const event = Number.isInteger(id) ? await getEventById(id) : null;
  if (!event) notFound();

  const { rsvps, totalCount, totalGuests } = await getRsvpsForEvent(event.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link
        href="/admin/song-club"
        className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
      >
        ← All meetups
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-xl font-medium">RSVPs — {event.title}</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          {totalCount} {totalCount === 1 ? "RSVP" : "RSVPs"} · {totalGuests} total{" "}
          {totalGuests === 1 ? "guest" : "guests"}
        </p>
      </div>

      {rsvps.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No RSVPs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/15 text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Guests</th>
                <th className="py-2 pr-4 font-medium">RSVP&apos;d</th>
                <th className="py-2 font-medium">Emailed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/10">
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 text-[#E8E0D0]/70">
                    <a href={`mailto:${r.email}`} className="hover:text-[#E8E0D0]">
                      {r.email}
                    </a>
                  </td>
                  <td className="py-2 pr-4">{r.guests}</td>
                  <td className="py-2 pr-4 text-[#E8E0D0]/60">{formatDateTime(r.created_at)}</td>
                  <td className="py-2 text-[#E8E0D0]/60">
                    {r.confirmation_email_sent_at ? "✓" : "—"}
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
