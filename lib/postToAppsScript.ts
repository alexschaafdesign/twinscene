/**
 * POST a form-encoded body to the Google Apps Script submission endpoint and
 * parse its JSON reply defensively.
 *
 * Apps Script intermittently answers with an HTML page instead of JSON — a
 * transient Google error, a quota/redirect page, etc. Passing that to
 * `res.json()` surfaces as the cryptic `Unexpected token '<', "<!DOCTYPE "...`.
 * Here we read the body as text first and only then JSON.parse it, so a
 * non-JSON reply becomes a clear error.
 *
 * We also retry a couple of times on a network error or non-JSON reply. That's
 * safe for band writes because writeToIndex_ upserts by slug (a repeat of the
 * same submission updates the existing row rather than duplicating it); at
 * worst it appends an extra Submissions audit row and re-sends the notification.
 */
export async function postToAppsScript(
  url: string,
  body: URLSearchParams,
  retries = 2,
): Promise<{ success: boolean; error?: string; [key: string]: unknown }> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", body });
      const text = await res.text();
      try {
        return JSON.parse(text) as { success: boolean; error?: string };
      } catch {
        throw new Error(
          `Server returned a non-JSON response (HTTP ${res.status}). ` +
            `This is usually a transient Apps Script hiccup — try again.`,
        );
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        // Brief linear backoff before retrying.
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastErr ?? new Error("Submission failed");
}
