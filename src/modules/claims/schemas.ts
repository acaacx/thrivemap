import { z } from "zod";

/**
 * Claim wizard schemas. Input and output types must stay identical
 * (no .coerce/.default) so zodResolver typing works — see AGENTS notes.
 */

export const CLAIM_RELATIONSHIPS = [
  "Owner",
  "Director / Officer",
  "Clinic administrator",
  "Staff member",
  "Authorized representative",
] as const;

export const claimDetailsSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(120, "Name looks too long."),
  work_email: z
    .string()
    .trim()
    .email("Enter the work email you use at the clinic.")
    .max(200),
  mobile_number: z
    .string()
    .trim()
    .min(7, "Enter a mobile number we can reach you at.")
    .max(20, "Mobile number looks too long.")
    .regex(/^[+\d][\d\s-]+$/, "Digits, spaces, dashes and a leading + only."),
  job_title: z
    .string()
    .trim()
    .min(2, "What is your role at the clinic?")
    .max(120),
  relationship: z.enum(CLAIM_RELATIONSHIPS, {
    error: "Choose how you are connected to the clinic.",
  }),
  business_registration_info: z
    .string()
    .trim()
    .max(500, "Keep registration details under 500 characters.")
    .optional(),
});

export type ClaimDetailsInput = z.infer<typeof claimDetailsSchema>;

export const CLAIM_DOCUMENT_KINDS = [
  { value: "proof_of_affiliation", label: "Proof of affiliation" },
  { value: "government_id", label: "Government ID" },
  { value: "business_registration", label: "Business registration" },
  { value: "other", label: "Other supporting document" },
] as const;

export type ClaimDocumentKind = (typeof CLAIM_DOCUMENT_KINDS)[number]["value"];

export const claimDocumentSchema = z.object({
  claim_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500),
  kind: z.enum([
    "proof_of_affiliation",
    "government_id",
    "business_registration",
    "other",
  ]),
  original_filename: z.string().trim().min(1).max(255),
});

export type ClaimDocumentInput = z.infer<typeof claimDocumentSchema>;

export const CLAIM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const CLAIM_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const CLAIM_UPLOAD_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
