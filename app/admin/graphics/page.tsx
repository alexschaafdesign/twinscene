import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import GraphicsPanel from "@/components/GraphicsPanel";

// Reads the session at request time — never cache.
export const dynamic = "force-dynamic";

export default async function GraphicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/graphics");
  if (!isAdmin(user)) return <NotAdmin />;

  return <GraphicsPanel />;
}
