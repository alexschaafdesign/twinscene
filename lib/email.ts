// Minimal outbound email abstraction for magic-link login. No SDK dependency —
// talks to Resend's HTTP API directly with fetch when RESEND_API_KEY is set.
// Without it (e.g. local dev), sendEmail() logs the content to the console
// instead of failing, so the login flow is testable with zero email setup.

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Twin Scene <login@twinscene.org>";

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("lib/email: RESEND_API_KEY is not set");
    }
    console.log(`\n--- sendEmail (no RESEND_API_KEY, logging instead) ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log(`--- end email ---\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`lib/email: Resend request failed (${res.status}): ${body}`);
  }
}
