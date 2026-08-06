import { describe, expect, it } from "vitest";
import {
  inquiryCreatedJob,
  inquiryMessageJob,
  inquiryStatusJob,
} from "./notify";
import { emailTemplates } from "@/modules/shared/email";

const iid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("inquiry notification job builders", () => {
  it("created: keyed once per inquiry", () => {
    const job = inquiryCreatedJob(iid);
    expect(job.payload).toEqual({ inquiry_id: iid, kind: "created" });
    expect(job.idempotencyKey).toBe(`inquiry-notify:created:${iid}`);
  });

  it("message: keyed per message", () => {
    const job = inquiryMessageJob(iid, mid);
    expect(job.payload).toEqual({
      inquiry_id: iid,
      kind: "message",
      message_id: mid,
    });
    expect(job.idempotencyKey).toBe(`inquiry-notify:message:${mid}`);
  });

  it("status: keyed per transition instant", () => {
    const at = "2026-08-06T10:00:00.000Z";
    const job = inquiryStatusJob(iid, "confirmed", at);
    expect(job.payload).toEqual({
      inquiry_id: iid,
      kind: "status",
      status: "confirmed",
    });
    expect(job.idempotencyKey).toBe(
      `inquiry-notify:status:${iid}:confirmed:${at}`,
    );
  });
});

describe("inquiry email templates", () => {
  it("render subject, link path, and excerpt", () => {
    const received = emailTemplates.inquiryReceived({
      name: "Rep",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      path: "/clinic-portal/abc/inquiries/def",
    });
    expect(received.subject).toContain("Sunrise Center");
    expect(received.html).toContain("/clinic-portal/abc/inquiries/def");

    const reply = emailTemplates.inquiryReply({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      excerpt: "Yes, we have slots on…",
      path: "/account/inquiries/def",
    });
    expect(reply.html).toContain("Yes, we have slots on…");
    expect(reply.text).toContain("/account/inquiries/def");

    const status = emailTemplates.inquiryStatusChanged({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      statusLabel: "Confirmed",
      confirmedDate: "2026-09-15",
      path: "/account/inquiries/def",
    });
    expect(status.subject).toContain("Confirmed");
    expect(status.html).toContain("2026-09-15");
  });

  it("escapes HTML in user-supplied subject and excerpt", () => {
    const received = emailTemplates.inquiryReceived({
      name: "Rep",
      clinicName: "Sunrise Center",
      subject: "<b>x</b>",
      path: "/clinic-portal/abc/inquiries/def",
    });
    expect(received.html).not.toContain("<b>x</b>");
    expect(received.html).toContain("&lt;b&gt;x&lt;/b&gt;");

    const reply = emailTemplates.inquiryReply({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "<b>x</b>",
      excerpt: "<script>alert(1)</script>",
      path: "/account/inquiries/def",
    });
    expect(reply.html).not.toContain("<script>alert(1)</script>");
    expect(reply.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const status = emailTemplates.inquiryStatusChanged({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "<b>x</b>",
      statusLabel: "Confirmed",
      confirmedDate: "2026-09-15",
      path: "/account/inquiries/def",
    });
    expect(status.html).not.toContain("<b>x</b>");
    expect(status.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
