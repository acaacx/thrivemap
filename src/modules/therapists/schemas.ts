import { z } from "zod";

// NOTE: consumed by react-hook-form's zodResolver — no .coerce / .default().
const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is too short.`)
    .max(max, `${label} is too long.`);

export const therapistInputSchema = z.object({
  full_name: trimmed(2, 120, "Name"),
  credentials: z
    .string()
    .trim()
    .max(80, "Credentials are too long.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  profession: trimmed(1, 80, "Profession"),
  specialties: z
    .array(trimmed(1, 60, "Specialty"))
    .max(10, "List up to 10 specialties."),
  bio: z
    .string()
    .trim()
    .max(1000, "Bio is too long (1000 characters max).")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type TherapistInput = z.infer<typeof therapistInputSchema>;

export const moveTherapistSchema = z.object({
  therapist_id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

export const therapistPhotoSchema = z.object({
  therapist_id: z.string().uuid(),
  storage_path: z.string().min(1).max(400),
});
