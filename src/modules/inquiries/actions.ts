"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { enqueueJob } from "@/modules/jobs/queue";
import {
  inquiryCreatedJob,
  inquiryMessageJob,
  inquiryStatusJob,
} from "./notify";
import {
  createInquirySchema,
  replyInquirySchema,
  reportInquirySchema,
  setInquiryStatusSchema,
} from "./schemas";

export interface InquiryActionResult {
  error?: string;
  message?: string;
  inquiryId?: string;
}

const SIGN_IN_MESSAGE = "Sign in to send inquiries.";

export async function createInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = createInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit("inquiry-create", user.id, 5, 86_400);
  if (!limited.allowed) {
    return {
      error: "You've sent several inquiries today. Please try again tomorrow.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: inquiryId, error } = await supabase.rpc("create_inquiry", {
    p_clinic_id: parsed.data.clinicId,
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
    p_preferred_date: parsed.data.preferredDate || undefined,
    p_preferred_time_note: parsed.data.preferredTimeNote || undefined,
  });
  if (error || !inquiryId) {
    console.error("createInquiryAction: create_inquiry failed", error);
    return { error: friendlyRpcError(error?.message) };
  }

  const job = inquiryCreatedJob(inquiryId);
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath("/account/inquiries");
  return { message: "Inquiry sent.", inquiryId };
}

export async function replyInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = replyInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review your reply.",
    };
  }

  const limited = await checkRateLimit("inquiry-reply", user.id, 30, 3_600);
  if (!limited.allowed) {
    return { error: "Too many replies in a short time. Please slow down." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: messageId, error } = await supabase.rpc("reply_inquiry", {
    p_inquiry_id: parsed.data.inquiryId,
    p_body: parsed.data.body,
  });
  if (error || !messageId) {
    console.error("replyInquiryAction: reply_inquiry failed", error);
    return { error: friendlyRpcError(error?.message) };
  }

  const job = inquiryMessageJob(parsed.data.inquiryId, messageId);
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath(`/account/inquiries/${parsed.data.inquiryId}`);
  return { message: "Reply sent." };
}

export async function setInquiryStatusAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = setInquiryStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the update.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_inquiry_status", {
    p_inquiry_id: parsed.data.inquiryId,
    p_status: parsed.data.status,
    // p_confirmed_date is an optional key in the generated Args type
    // (`string`, not nullable), so `undefined` — meaning "omit" — is valid.
    p_confirmed_date: parsed.data.confirmedDate || undefined,
  });
  if (error) {
    console.error("setInquiryStatusAction: set_inquiry_status failed", error);
    return { error: friendlyRpcError(error.message) };
  }

  // status_changed_at was just stamped by the RPC; read it back for the
  // idempotency key so retries of THIS transition dedupe.
  const { data: row } = await supabase
    .from("inquiries")
    .select("status_changed_at")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  const job = inquiryStatusJob(
    parsed.data.inquiryId,
    parsed.data.status,
    row?.status_changed_at ?? new Date().toISOString(),
  );
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath(`/account/inquiries/${parsed.data.inquiryId}`);
  return { message: "Status updated." };
}

export async function reportInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = reportInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the report.",
    };
  }

  const limited = await checkRateLimit("report", user.id, 5, 86_400);
  if (!limited.allowed) {
    return { error: "Too many reports today. Please try again tomorrow." };
  }

  const supabase = await createSupabaseServerClient();
  // The thread's clinic id — visible only to participants under RLS, so
  // this doubles as the participation check.
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("clinic_id")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  if (!inquiry) return { error: "Conversation not found." };

  const { error } = await supabase.from("clinic_reports").insert({
    clinic_id: inquiry.clinic_id,
    inquiry_id: parsed.data.inquiryId,
    reported_by: user.id,
    report_type: parsed.data.reportType,
    details: parsed.data.details || null,
  });
  if (error) {
    console.error("reportInquiryAction: clinic_reports insert failed", error);
    return { error: "Could not submit the report. Please retry." };
  }

  return { message: "Report submitted. Our moderators will review it." };
}

/** Maps the raise messages in migration 18's RPCs to user-facing copy. */
function friendlyRpcError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("sign in")) {
    return SIGN_IN_MESSAGE;
  }
  if (message.includes("clinic not found")) {
    return "Clinic not found.";
  }
  if (message.includes("inquiry not found")) {
    return "Conversation not found.";
  }
  if (message.includes("not accepting inquiries")) {
    return "This clinic isn't accepting inquiries yet.";
  }
  if (message.includes("conversation is closed")) {
    return "This conversation is closed.";
  }
  if (message.includes("invalid status change")) {
    return "That status change isn't allowed anymore.";
  }
  if (message.includes("needs a date")) {
    return "Pick a date before confirming.";
  }
  if (message.includes("not authorized")) {
    return "You don't have access to this conversation.";
  }
  return "Something went wrong. Please try again.";
}
