import "server-only";
import type { EmailTemplateName } from "@/modules/shared/email";
import { enqueueJob } from "./queue";

/**
 * Notification helpers. Emails go through the send_email job so delivery is
 * retried and never blocks the calling action.
 */

/** Queue a templated email to a known user (resolved + preference-checked at send time). */
export async function enqueueUserEmail(
  userId: string,
  template: EmailTemplateName,
  params: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<void> {
  await enqueueJob(
    "send_email",
    { user_id: userId, template, params },
    { idempotencyKey },
  );
}

/** Queue a templated email to a raw address (e.g. anonymous submitter). */
export async function enqueueAddressEmail(
  to: string,
  template: EmailTemplateName,
  params: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<void> {
  await enqueueJob("send_email", { to, template, params }, { idempotencyKey });
}

/** Queue a plain notification to every moderator/administrator. */
export async function enqueueModeratorNotification(
  subject: string,
  body: string,
  idempotencyKey?: string,
): Promise<void> {
  await enqueueJob(
    "send_email",
    { moderators: true, subject, body },
    { idempotencyKey },
  );
}
