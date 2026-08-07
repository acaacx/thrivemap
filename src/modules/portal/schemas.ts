import { z } from "zod";

/** Editable profile fields in the clinic portal. Input==output types. */
export const portalProfileSchema = z.object({
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description under 2000 characters."),
  phone: z.string().trim().max(30, "Phone number looks too long."),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Enter a valid email or leave it blank.",
    }),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/.+\..+/.test(v), {
      message: "Website must start with http:// or https://.",
    }),
  offers_online_services: z.boolean(),
  offers_in_person_services: z.boolean(),
  wheelchair_accessible: z.boolean(),
  accessibility_notes: z.string().trim().max(1000),
});

export type PortalProfileInput = z.infer<typeof portalProfileSchema>;

export const portalServicesSchema = z.object({
  service_ids: z
    .array(z.uuid())
    .min(1, "Choose at least one service."),
});

export type PortalServicesInput = z.infer<typeof portalServicesSchema>;

const hourRowSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    is_closed: z.boolean(),
    opens_at: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    closes_at: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
  })
  .refine((row) => row.is_closed || (row.opens_at && row.closes_at), {
    message: "Set opening and closing times, or mark the day closed.",
  });

export const portalHoursSchema = z.object({
  hours: z.array(hourRowSchema).length(7),
});

export type PortalHoursInput = z.infer<typeof portalHoursSchema>;

export const portalImageSchema = z.object({
  clinic_id: z.uuid(),
  storage_path: z.string().min(1).max(500),
  alt_text: z.string().trim().max(300),
  kind: z.enum(["gallery", "logo", "cover"]),
});

export type PortalImageInput = z.infer<typeof portalImageSchema>;

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.webp";
export const IMAGE_UPLOAD_MIME = ["image/jpeg", "image/png", "image/webp"];
