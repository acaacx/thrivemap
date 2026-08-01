import { z } from "zod";

export const AGE_GROUPS = [
  "infants",
  "toddlers",
  "preschool",
  "school_age",
  "teenagers",
  "adults",
] as const;

export const SORT_OPTIONS = [
  "nearest",
  "relevance",
  "verified_first",
  "recently_verified",
  "alphabetical",
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

const commaList = (values?: readonly string[]) =>
  z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(
      values
        ? z.array(z.enum(values as [string, ...string[]]))
        : z.array(z.string()),
    );

const boolParam = z
  .string()
  .transform((v) => v === "1" || v === "true")
  .pipe(z.boolean());

/** Parses /clinics URL search params. Invalid values fall back to defaults. */
export const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(100).default(10),
  north: z.coerce.number().min(-90).max(90).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  services: commaList().optional(),
  ages: commaList(AGE_GROUPS).optional(),
  verified: boolParam.optional(),
  online: boolParam.optional(),
  inperson: boolParam.optional(),
  open: boolParam.optional(),
  accessible: boolParam.optional(),
  sort: z.enum(SORT_OPTIONS).default("nearest"),
  cursor: z.string().max(200).optional(),
  place: z.string().max(64).optional(),
  loc: z.string().max(120).optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

/** Parse raw Next.js searchParams into a validated SearchParams object. */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): SearchParams {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") flat[key] = value;
    else if (Array.isArray(value) && value[0] !== undefined)
      flat[key] = value[0];
  }
  const result = searchParamsSchema.safeParse(flat);
  if (result.success) return result.data;

  // Drop invalid keys and retry so one bad param doesn't nuke the search.
  const issuePaths = new Set(result.error.issues.map((i) => String(i.path[0])));
  const cleaned = Object.fromEntries(
    Object.entries(flat).filter(([k]) => !issuePaths.has(k)),
  );
  const retry = searchParamsSchema.safeParse(cleaned);
  return retry.success ? retry.data : searchParamsSchema.parse({});
}
