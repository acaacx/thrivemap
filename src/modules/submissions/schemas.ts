import { z } from "zod";

export const suggestClinicSchema = z.object({
  clinic_name: z.string().trim().min(3, "Enter the clinic's name.").max(160),
  address: z.string().trim().min(8, "Enter the full street address.").max(300),
  latitude: z.number().min(4).max(21).optional(), // Philippines bounds
  longitude: z.number().min(116).max(127).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(
      /^[+\d\s()-]*$/,
      "Phone may contain digits, spaces, +, - and parentheses.",
    )
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .max(254)
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Enter a full URL (https://…).")
    .max(300)
    .optional()
    .or(z.literal("")),
  social_media_url: z
    .string()
    .trim()
    .url("Enter a full URL.")
    .max(300)
    .optional()
    .or(z.literal("")),
  service_slugs: z.array(z.string().max(64)).max(12),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  reference_links: z.string().trim().max(1000).optional().or(z.literal("")),
  submitter_email: z
    .string()
    .trim()
    .email("Enter a valid email so we can update you.")
    .max(254)
    .optional()
    .or(z.literal("")),
  consent: z.literal(true, {
    message:
      "Please confirm the information is accurate to the best of your knowledge.",
  }),
});

export type SuggestClinicInput = z.infer<typeof suggestClinicSchema>;

export const reportClinicSchema = z.object({
  clinic_id: z.string().uuid(),
  report_type: z.enum([
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
  details: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const changeRequestSchema = z.object({
  clinic_id: z.string().uuid(),
  message: z
    .string()
    .trim()
    .min(10, "Describe what should change (at least 10 characters).")
    .max(2000),
  field_hint: z.string().trim().max(80).optional().or(z.literal("")),
});
