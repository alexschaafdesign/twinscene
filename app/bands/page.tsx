import { fetchBands } from "@/lib/fetchBands";
import BandGrid from "@/components/BandGrid";

// The /bands directory index: the filterable grid. Individual profiles live at
// /bands/[slug] as their own full-width pages.
export default async function BandsIndex() {
  const bands = await fetchBands();
  return <BandGrid bands={bands} />;
}
