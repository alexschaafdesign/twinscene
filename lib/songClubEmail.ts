// The confirmation email an attendee gets after RSVPing to a Song Club event.
// Everything is interpolated from the event's OWN record (resolved server-side),
// never from the client payload, so a stale/tampered submission can't put wrong
// details in the email. Sent through the shared lib/email.ts (Resend).

import { sendEmail } from "./email.ts";
import type { SongClubEvent } from "./songClub.ts";

const BCC_EMAIL = "alex.schaaf@gmail.com";

// "2026-08-15" -> "Saturday, August 15" (weekday + month + day, no year).
function formatEventDate(isoDate: string): string {
  const dateObj = new Date(isoDate + "T00:00:00");
  return dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// Escape user/DB-provided text before dropping it into the HTML body.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Renders both the subject and the two bodies (html + text) sendEmail expects.
export function renderRsvpConfirmationEmail(
  event: SongClubEvent,
  name: string
): { subject: string; html: string; text: string } {
  const greetName = firstName(name);
  const greeting = greetName ? `hi ${greetName}!` : "hi there!";
  const formattedDate = formatEventDate(event.event_date);

  // Assemble a "when/where" line list from whichever fields the event has.
  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;

  const subject = `Your RSVP for ${event.title}`;

  // --- plaintext ---
  const textLines = [
    greeting,
    "",
    `Thanks for RSVPing to ${event.title} on ${formattedDate}!`,
    "",
  ];
  if (event.venue_name) textLines.push(`Location: ${event.venue_name}`);
  if (event.address) textLines.push(`Address: ${event.address}`);
  if (timeLine) textLines.push(`Time: ${timeLine}`);
  if (event.arrival_notes) textLines.push("", event.arrival_notes);
  if (event.description) textLines.push("", event.description);
  textLines.push("", "See you there!", "— Twin Scene Song Club");
  const text = textLines.join("\n");

  // --- html ---
  const flyerBlock = event.flyer_url
    ? `<p><img src="${esc(event.flyer_url)}" alt="${esc(event.title)}" style="max-width: 500px; height: auto; display: block; margin: 20px 0;"></p>`
    : "";

  const detailRows: string[] = [];
  if (event.venue_name)
    detailRows.push(`<p style="margin: 4px 0;"><strong>Location:</strong> ${esc(event.venue_name)}</p>`);
  if (event.address)
    detailRows.push(`<p style="margin: 4px 0;"><strong>Address:</strong> ${esc(event.address)}</p>`);
  if (timeLine)
    detailRows.push(`<p style="margin: 4px 0;"><strong>Time:</strong> ${esc(timeLine)}</p>`);

  const arrivalBlock = event.arrival_notes
    ? `<p style="white-space: pre-wrap;">${esc(event.arrival_notes)}</p>`
    : "";
  const descriptionBlock = event.description
    ? `<p style="white-space: pre-wrap;">${esc(event.description)}</p>`
    : "";

  const html = `${flyerBlock}
<p>${esc(greeting)}</p>
<p>Thanks for RSVPing to <strong>${esc(event.title)}</strong> on ${esc(formattedDate)}!</p>
${detailRows.length ? `<div style="margin: 16px 0;">${detailRows.join("\n")}</div>` : ""}
${arrivalBlock}
${descriptionBlock}
<p>See you there!</p>
<p>— Twin Scene Song Club</p>
`;

  return { subject, html, text };
}

export async function sendRsvpConfirmationEmail({
  event,
  name,
  email,
}: {
  event: SongClubEvent;
  name: string;
  email: string;
}): Promise<void> {
  const { subject, html, text } = renderRsvpConfirmationEmail(event, name);
  await sendEmail({ to: email, bcc: BCC_EMAIL, subject, html, text });
}
