import type { SearchParams } from "@/modules/search/schemas";

/**
 * Turns search params into the words on the card. Pure: `serviceNames` is a
 * slug→name map the caller builds from getServices(), so the whole label table
 * is testable without a database.
 *
 * Everything here ends up inside SVG text, so every user-supplied string is
 * stripped of XML-significant characters and clamped in length.
 */

export interface CardLabels {
  /** Big line. Also becomes og:title. */
  headline: string;
  /** Small line under the headline. Describes the image, never the database. */
  count: string;
  /** og:description. */
  description: string;
  /** og:image:alt. */
  alt: string;
}

export interface LabelInput {
  params: SearchParams;
  pinCount: number;
  /** True when get_map_clinics returned its 400-row cap. */
  atCap: boolean;
  serviceNames: Record<string, string>;
}

const MAX_HEADLINE = 80;

/**
 * `loc` and `q` are free text from the URL. They go into SVG, so drop the
 * characters that could close a tag, collapse whitespace, and clamp.
 */
function clean(value: string, maxLength: number): string {
  const stripped = value
    .replace(/[<>&"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clamp(stripped, maxLength);
}

/**
 * Length-only clamp, no character stripping. By the time a headline is
 * assembled, every user-supplied fragment inside it has already been
 * cleaned exactly once — re-stripping the whole headline here would eat
 * presentational characters the headline template itself adds, like the
 * quote marks around a free-text query.
 */
function clamp(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 1).trimEnd()}…`
    : value;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Human name for a service slug, falling back to a de-slugged form. */
function serviceLabel(slug: string, names: Record<string, string>): string {
  const known = names[slug];
  if (known) return known;
  return capitalise(slug.replace(/-/g, " "));
}

/** "Speech therapy", or "Speech therapy + 2 more". */
function servicePhrase(
  services: string[],
  names: Record<string, string>,
): string {
  const first = serviceLabel(services[0]!, names);
  const rest = services.length - 1;
  return rest > 0 ? `${first} + ${rest} more` : first;
}

function buildHeadline(
  params: SearchParams,
  serviceNames: Record<string, string>,
): string {
  const place = params.loc ? clean(params.loc, 60) : "";
  const services = params.services ?? [];

  let headline: string;
  if (services.length > 0) {
    headline = servicePhrase(services, serviceNames);
    headline = place
      ? `${headline} in ${place}`
      : `${headline} in the Philippines`;
  } else if (params.q) {
    const query = clean(params.q, 40);
    headline = place
      ? `"${query}" in ${place}`
      : `"${query}" — therapy clinics`;
  } else if (place) {
    headline = `Therapy clinics in ${place}`;
  } else if (params.verified) {
    headline = "Verified clinics in the Philippines";
  } else {
    headline = "Therapy clinics across the Philippines";
  }

  return clamp(headline, MAX_HEADLINE);
}

/**
 * The card counts the pins it drew, not a database total — there is no total
 * anywhere (ClinicSearchResult is {clinics, nextCursor}) and this statement
 * describes the image, so it cannot be wrong. At the RPC's 400-row cap it
 * reads as a floor.
 */
function buildCount(pinCount: number, atCap: boolean): string {
  if (atCap) return `${pinCount}+ clinics on this map`;
  return pinCount === 1
    ? "1 clinic on this map"
    : `${pinCount} clinics on this map`;
}

export function buildLabels(input: LabelInput): CardLabels {
  const { params, pinCount, atCap, serviceNames } = input;
  const headline = buildHeadline(params, serviceNames);
  const count = buildCount(pinCount, atCap);

  return {
    headline,
    count,
    description: `${headline}. ${count} on ThriveMap — compare clinics, see what they offer, and reach out.`,
    alt: `A map of the Philippines with ${pinCount} clinic${
      pinCount === 1 ? "" : "s"
    } marked. ${headline}.`,
  };
}

export function buildFallbackLabels(
  params: SearchParams,
  serviceNames: Record<string, string>,
): CardLabels {
  const headline = buildHeadline(params, serviceNames);
  return {
    headline,
    count: "No clinics match yet",
    description: `${headline}. Browse therapy and developmental clinics across the Philippines on ThriveMap.`,
    alt: `ThriveMap — ${headline}.`,
  };
}
