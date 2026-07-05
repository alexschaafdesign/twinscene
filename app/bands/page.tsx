import { redirect } from "next/navigation";

// No standalone /bands index yet — the directory lives at the site root for now.
// Redirect /bands to home so the URL isn't a dead end. When a real /bands
// section is added later (alongside /venues, /labels, …), replace this.
export default function BandsIndex() {
  redirect("/");
}
