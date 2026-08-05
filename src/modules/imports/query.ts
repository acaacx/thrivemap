export const IMPORT_SERVICE_TERMS = [
  { slug: "autism-therapy", label: "Autism therapy" },
  { slug: "occupational-therapy", label: "Occupational therapy" },
  { slug: "speech-therapy", label: "Speech therapy" },
  { slug: "developmental-pediatrician", label: "Developmental pediatrician" },
  { slug: "aba-therapy", label: "ABA therapy" },
] as const;

export type ImportServiceTermSlug =
  (typeof IMPORT_SERVICE_TERMS)[number]["slug"];

/**
 * The only query shape the importer ever sends: a fixed service term plus a
 * seeded PH city. No free text (quota + injection hygiene).
 */
export function buildImportQuery(termSlug: string, cityName: string): string {
  const term = IMPORT_SERVICE_TERMS.find((t) => t.slug === termSlug);
  if (!term) throw new Error(`unknown service term: ${termSlug}`);
  return `${term.label} in ${cityName}, Philippines`;
}
