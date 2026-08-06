/**
 * Pure builders for inquiry_notification jobs — payload + idempotency key
 * only, so they stay unit-testable. Enqueueing happens in actions.ts; the
 * handler lives in src/modules/jobs/handlers.ts.
 */

export interface InquiryNotificationPayload {
  inquiry_id: string;
  kind: "created" | "message" | "status";
  message_id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface InquiryNotificationJob {
  payload: InquiryNotificationPayload;
  idempotencyKey: string;
}

export function inquiryCreatedJob(inquiryId: string): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "created" },
    idempotencyKey: `inquiry-notify:created:${inquiryId}`,
  };
}

export function inquiryMessageJob(
  inquiryId: string,
  messageId: string,
): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "message", message_id: messageId },
    idempotencyKey: `inquiry-notify:message:${messageId}`,
  };
}

export function inquiryStatusJob(
  inquiryId: string,
  status: string,
  statusChangedAt: string,
): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "status", status },
    idempotencyKey: `inquiry-notify:status:${inquiryId}:${status}:${statusChangedAt}`,
  };
}
