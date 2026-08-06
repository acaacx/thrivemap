import { describe, expect, it } from "vitest";
import {
  canTransition,
  createInquirySchema,
  replyInquirySchema,
  reportInquirySchema,
  setInquiryStatusSchema,
} from "./schemas";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createInquirySchema", () => {
  it("accepts a full valid payload", () => {
    const result = createInquirySchema.safeParse({
      clinicId: uuid,
      subject: "Initial assessment for my son",
      preferredDate: "2026-09-01",
      preferredTimeNote: "weekday mornings",
      body: "Do you assess 4-year-olds?",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty optional fields", () => {
    const result = createInquirySchema.safeParse({
      clinicId: uuid,
      subject: "Question",
      preferredDate: "",
      preferredTimeNote: "",
      body: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "Question",
        preferredDate: "next tuesday",
        preferredTimeNote: "",
        body: "Hello",
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-bounds subject and body", () => {
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "ab",
        preferredDate: "",
        preferredTimeNote: "",
        body: "Hello",
      }).success,
    ).toBe(false);
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "Question",
        preferredDate: "",
        preferredTimeNote: "",
        body: "x".repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe("setInquiryStatusSchema", () => {
  it("requires a date when confirming", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "confirmed",
        confirmedDate: "",
      }).success,
    ).toBe(false);
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "confirmed",
        confirmedDate: "2026-09-15",
      }).success,
    ).toBe(true);
  });

  it("does not require a date otherwise", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "closed",
        confirmedDate: "",
      }).success,
    ).toBe(true);
  });

  it("rejects 'open' as a target", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "open",
        confirmedDate: "",
      }).success,
    ).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows non-terminal → resolution states", () => {
    expect(canTransition("open", "replied")).toBe(true);
    expect(canTransition("open", "confirmed")).toBe(true);
    expect(canTransition("replied", "declined")).toBe(true);
    expect(canTransition("confirmed", "closed")).toBe(true);
  });

  it("blocks anything out of terminal states and reopening", () => {
    expect(canTransition("closed", "replied")).toBe(false);
    expect(canTransition("declined", "confirmed")).toBe(false);
    expect(canTransition("replied", "open")).toBe(false);
  });
});

describe("replyInquirySchema / reportInquirySchema", () => {
  it("bounds reply body", () => {
    expect(
      replyInquirySchema.safeParse({ inquiryId: uuid, body: "" }).success,
    ).toBe(false);
    expect(
      replyInquirySchema.safeParse({ inquiryId: uuid, body: "ok" }).success,
    ).toBe(true);
  });

  it("accepts a known report type", () => {
    expect(
      reportInquirySchema.safeParse({
        inquiryId: uuid,
        reportType: "inappropriate_content",
        details: "abusive language",
      }).success,
    ).toBe(true);
    expect(
      reportInquirySchema.safeParse({
        inquiryId: uuid,
        reportType: "not_a_type",
        details: "",
      }).success,
    ).toBe(false);
  });
});
