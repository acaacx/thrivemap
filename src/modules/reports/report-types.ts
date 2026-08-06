/**
 * Single source of truth for report types + display labels. Mirrors the
 * `report_type` pg enum (migration 1) — keep in sync if the enum grows.
 */
export const REPORT_TYPES = [
  "wrong_address",
  "wrong_phone",
  "incorrect_hours",
  "incorrect_services",
  "permanently_closed",
  "temporarily_closed",
  "duplicate_listing",
  "misleading_information",
  "inappropriate_content",
  "other",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  wrong_address: "Wrong address",
  wrong_phone: "Wrong phone number",
  incorrect_hours: "Incorrect opening hours",
  incorrect_services: "Incorrect services",
  permanently_closed: "Permanently closed",
  temporarily_closed: "Temporarily closed",
  duplicate_listing: "Duplicate listing",
  misleading_information: "Misleading information",
  inappropriate_content: "Inappropriate content",
  other: "Other",
};

/**
 * Types that make sense when reporting an inquiry conversation (the rest
 * describe clinic listing data). Enforced by reportInquirySchema too.
 */
export const CONVERSATION_REPORT_TYPES = [
  "misleading_information",
  "inappropriate_content",
  "other",
] as const satisfies readonly ReportType[];
