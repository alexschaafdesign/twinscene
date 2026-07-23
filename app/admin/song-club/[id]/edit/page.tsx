import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getEventById } from "@/lib/songClub";
import SongClubEventForm from "@/components/SongClubEventForm";

export const metadata: Metadata = {
  title: "Edit meetup — Twin Scene Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditSongClubEventPage({
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

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="mb-6 text-xl font-medium">Edit meetup</h1>
      <SongClubEventForm
        mode="edit"
        initial={{
          id: event.id,
          title: event.title,
          eventDate: event.event_date,
          startTime: event.start_time ?? "",
          endTime: event.end_time ?? "",
          venueName: event.venue_name ?? "",
          address: event.address ?? "",
          arrivalNotes: event.arrival_notes ?? "",
          description: event.description ?? "",
          flyerUrl: event.flyer_url ?? "",
          published: event.published,
        }}
      />
    </main>
  );
}
