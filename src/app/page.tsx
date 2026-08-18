import { SearchShell } from "@/modules/search/components/SearchShell";
import { parseSearchParams } from "@/modules/search/schemas";

// The homepage is the application: the same shell as /clinics, in its
// empty state ("Where are you looking for support?"). Static + ISR — it
// deliberately does not read searchParams; searching rewrites the URL to
// /clinics?… client-side, which carries the full contract.
export const revalidate = 300;

export default function HomePage() {
  return <SearchShell params={parseSearchParams({})} tolerateDataErrors />;
}
