import { z } from "zod";

export const INQUIRY_STATUSES = [
  "open",
  "replied",
  "confirmed",
  "declined",
  "closed",
] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  open: "Awaiting reply",
  replied: "Replied",
  confirmed: "Confirmed",
  declined: "Declined",
  closed: "Closed",
};

const TERMINAL: ReadonlySet<InquiryStatus> = new Set(["declined", "closed"]);
const TARGETS: ReadonlySet<InquiryStatus> = new Set([
  "replied",
  "confirmed",
  "declined",
  "closed",
]);

/** Mirrors set_inquiry_status in migration 18 — keep the two in sync. */
export function canTransition(from: InquiryStatus, to: InquiryStatus): boolean {
  return !TERMINAL.has(from) && TARGETS.has(to);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a valid date");

const optionalIsoDate = z
  .union([isoDate, z.literal("")])
  .optional();

const bodyField = z
  .string()
  .min(1, "Please write a message")
  .max(4000, "Messages are limited to 4000 characters");

export const createInquirySchema = z.object({
  clinicId: z.string().uuid(),
  subject: z
    .string()
    .min(3, "Please add a short subject")
    .max(200, "Subjects are limited to 200 characters"),
  preferredDate: optionalIsoDate,
  preferredTimeNote: z
    .string()
    .max(200, "Keep the time note under 200 characters")
    .optional(),
  body: bodyField,
});

export const replyInquirySchema = z.object({
  inquiryId: z.string().uuid(),
  body: bodyField,
});

export const setInquiryStatusSchema = z
  .object({
    inquiryId: z.string().uuid(),
    status: z.enum(["replied", "confirmed", "declined", "closed"]),
    confirmedDate: optionalIsoDate,
  })
  .superRefine((value, ctx) => {
    if (value.status === "confirmed" && !value.confirmedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedDate"],
        message: "Pick the confirmed date",
      });
    }
  });

export const reportInquirySchema = z.object({
  inquiryId: z.string().uuid(),
  reportType: z.enum([
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
  ]),
  details: z
    .string()
    .max(2000, "Keep details under 2000 characters")
    .optional(),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type ReplyInquiryInput = z.infer<typeof replyInquirySchema>;
export type SetInquiryStatusInput = z.infer<typeof setInquiryStatusSchema>;
export type ReportInquiryInput = z.infer<typeof reportInquirySchema>;
