import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function anonClient() {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

async function signedInClient(email: string) {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "password123",
  });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

const service = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** A clinic clinicrep@ manages (active clinic_managers row). */
async function managedClinicId(): Promise<string> {
  const { data: list } = await service.auth.admin.listUsers();
  const rep = list.users.find((u) => u.email === "clinicrep@thrivemap.test")!;
  const { data: grant } = await service
    .from("clinic_managers")
    .select("clinic_id")
    .eq("user_id", rep.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!grant) throw new Error("seed data: clinicrep@ has no managed clinic");
  return grant.clinic_id;
}

/** A published clinic with NO active managers (unclaimed). */
async function unclaimedClinicId(): Promise<string> {
  const { data: clinics } = await service
    .from("clinics")
    .select("id, clinic_managers(id, revoked_at)")
    .in("status", ["published_verified", "published_unverified"])
    .is("deleted_at", null)
    .limit(50);
  const hit = clinics?.find(
    (c) => !c.clinic_managers?.some((m) => m.revoked_at === null),
  );
  if (!hit) throw new Error("seed data: no unclaimed clinic found");
  return hit.id;
}

async function cleanup() {
  // Idempotent: remove threads created by these tests (subject marker).
  const { data } = await service
    .from("inquiries")
    .select("id")
    .like("subject", "[itest]%");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) {
    await service.from("clinic_reports").delete().in("inquiry_id", ids);
    await service.from("inquiries").delete().in("id", ids);
  }
}

beforeAll(async () => {
  const { error } = await anonClient().from("services").select("id").limit(1);
  if (error) throw new Error(`Supabase local not reachable: ${error.message}`);
  await cleanup();
});
afterAll(cleanup);

describe("inquiries: create_inquiry", () => {
  it("caregiver can open a thread on a claimed clinic; first message lands", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await managedClinicId();
    const { data: inquiryId, error } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] Initial assessment",
      p_preferred_date: "2026-09-01",
      p_preferred_time_note: "weekday mornings",
      p_body: "Hi, do you assess 4-year-olds?",
    });
    expect(error).toBeNull();
    expect(inquiryId).toBeTruthy();
    const { data: msgs } = await caregiver
      .from("inquiry_messages")
      .select("sender_role, body")
      .eq("inquiry_id", inquiryId!);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].sender_role).toBe("caregiver");
  });

  it("rejects unclaimed clinics", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await unclaimedClinicId();
    const { error } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] should fail",
      p_body: "hello",
    });
    expect(error?.message).toMatch(/not accepting inquiries/i);
  });

  it("rejects anonymous callers", async () => {
    const { error } = await anonClient().rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] anon",
      p_body: "hello",
    });
    expect(error).not.toBeNull();
  });
});

describe("inquiries: visibility", () => {
  let inquiryId: string;

  beforeAll(async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] visibility thread",
      p_body: "visibility check",
    });
    inquiryId = data!;
  });

  it("caregiver sees own thread", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toHaveLength(1);
  });

  it("managing rep sees the thread", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { data } = await rep
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toHaveLength(1);
  });

  it("unrelated signed-in user sees nothing (moderator has no manager grant)", async () => {
    const other = await signedInClient("moderator@thrivemap.test");
    const { data } = await other
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toEqual([]);
    const { data: msgs } = await other
      .from("inquiry_messages")
      .select("id")
      .eq("inquiry_id", inquiryId);
    expect(msgs).toEqual([]);
  });

  it("direct inserts are blocked even for participants", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: me } = await caregiver.auth.getUser();
    const { error } = await caregiver.from("inquiry_messages").insert({
      inquiry_id: inquiryId,
      sender_id: me.user!.id,
      sender_role: "caregiver",
      body: "sneaky direct insert",
    });
    expect(error).not.toBeNull();
  });
});

describe("inquiries: reply + status lifecycle", () => {
  let inquiryId: string;

  beforeAll(async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] lifecycle thread",
      p_preferred_date: "2026-09-15",
      p_body: "lifecycle check",
    });
    inquiryId = data!;
  });

  it("rep reply flips open → replied", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { error } = await rep.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "Yes, we have slots.",
    });
    expect(error).toBeNull();
    const { data } = await rep
      .from("inquiries")
      .select("status")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("replied");
  });

  it("non-manager cannot reply or set status", async () => {
    const other = await signedInClient("moderator@thrivemap.test");
    const { error: replyErr } = await other.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "intruding",
    });
    expect(replyErr).not.toBeNull();
    const { error: statusErr } = await other.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "closed",
    });
    expect(statusErr).not.toBeNull();
  });

  it("confirm requires a date; sets confirmed_date", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { error: noDate } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "confirmed",
    });
    expect(noDate?.message).toMatch(/date/i);
    const { error } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "confirmed",
      p_confirmed_date: "2026-09-15",
    });
    expect(error).toBeNull();
    const { data } = await rep
      .from("inquiries")
      .select("status, confirmed_date")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("confirmed");
    expect(data!.confirmed_date).toBe("2026-09-15");
  });

  it("caregiver can still reply on a confirmed thread", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { error } = await caregiver.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "Thank you, see you then!",
    });
    expect(error).toBeNull();
    // Caregiver reply must NOT downgrade confirmed.
    const { data } = await caregiver
      .from("inquiries")
      .select("status")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("confirmed");
  });

  it("declined is terminal: rejects replies and further transitions", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: declinedId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] declined thread",
      p_body: "to be declined",
    });
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { error: declineErr } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: declinedId!,
      p_status: "declined",
    });
    expect(declineErr).toBeNull();

    const { error: replyErr } = await rep.rpc("reply_inquiry", {
      p_inquiry_id: declinedId!,
      p_body: "too late",
    });
    expect(replyErr?.message).toMatch(/closed/i);
    const { error: caregiverReplyErr } = await caregiver.rpc("reply_inquiry", {
      p_inquiry_id: declinedId!,
      p_body: "please reconsider",
    });
    expect(caregiverReplyErr?.message).toMatch(/closed/i);
    const { error: reopenErr } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: declinedId!,
      p_status: "replied",
    });
    expect(reopenErr?.message).toMatch(/closed/i);
  });

  it("closed thread rejects replies and further transitions", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "closed",
    });
    const { error: replyErr } = await rep.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "too late",
    });
    expect(replyErr?.message).toMatch(/closed/i);
    const { error: reopenErr } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "replied",
    });
    expect(reopenErr).not.toBeNull();
  });
});

describe("inquiries: reported-thread moderator access", () => {
  it("moderator reads a thread only through a report", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await managedClinicId();
    const { data: inquiryId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] reported thread",
      p_body: "message to be reported",
    });
    const { data: report } = await service
      .from("clinic_reports")
      .insert({
        clinic_id: clinicId,
        report_type: "inappropriate_content",
        details: "[itest] abusive message",
        inquiry_id: inquiryId,
      })
      .select("id")
      .single();

    const moderator = await signedInClient("moderator@thrivemap.test");
    const { data: thread, error } = await moderator.rpc(
      "get_reported_inquiry_thread",
      { p_report_id: report!.id },
    );
    expect(error).toBeNull();
    const parsed = thread as {
      inquiry: { id: string; subject: string };
      messages: Array<{ body: string }>;
    };
    expect(parsed.inquiry.id).toBe(inquiryId);
    expect(parsed.messages).toHaveLength(1);

    // Caregiver (non-moderator) cannot use the moderator read path.
    const { error: denied } = await caregiver.rpc(
      "get_reported_inquiry_thread",
      { p_report_id: report!.id },
    );
    expect(denied).not.toBeNull();
  });
});

describe("inquiries: clinic_reports insert policy", () => {
  it("a non-participant cannot report someone else's inquiry thread directly", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await managedClinicId();
    const { data: inquiryId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] non-participant report",
      p_body: "message not to be reported by a stranger",
    });

    const moderator = await signedInClient("moderator@thrivemap.test");
    const { error } = await moderator.from("clinic_reports").insert({
      clinic_id: clinicId,
      inquiry_id: inquiryId,
      report_type: "inappropriate_content",
      details: "[itest] moderator is not a participant",
    });
    expect(error).not.toBeNull();
  });

  it("participant cannot report their inquiry against a different clinic id", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: me } = await caregiver.auth.getUser();
    const clinicId = await managedClinicId();
    const otherClinicId = await unclaimedClinicId();
    const { data: inquiryId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] clinic-mismatch report",
      p_body: "report should only bind to the thread's own clinic",
    });

    // can_report_inquiry requires clinic_id to be the inquiry's actual
    // clinic — pointing the report at another clinic must fail even for a
    // genuine participant.
    const { error } = await caregiver.from("clinic_reports").insert({
      clinic_id: otherClinicId,
      inquiry_id: inquiryId,
      reported_by: me.user!.id,
      report_type: "inappropriate_content",
      details: "[itest] wrong clinic id",
    });
    expect(error).not.toBeNull();
  });

  it("the participant caregiver can report their own inquiry thread", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: me } = await caregiver.auth.getUser();
    const clinicId = await managedClinicId();
    const { data: inquiryId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] participant report",
      p_body: "message to be reported by its own caregiver",
    });

    // reported_by must be set (matches reportInquiryAction in production):
    // Postgres also enforces the table's SELECT policy on INSERT ...
    // RETURNING rows, and "clinic_reports: own read" only allows a reporter
    // to read back their own (reported_by = auth.uid()) report.
    const { data: report, error } = await caregiver
      .from("clinic_reports")
      .insert({
        clinic_id: clinicId,
        inquiry_id: inquiryId,
        reported_by: me.user!.id,
        report_type: "inappropriate_content",
        details: "[itest] participant self-report",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(report?.id).toBeTruthy();

    await service.from("clinic_reports").delete().eq("id", report!.id);
  });
});

describe("inquiry query shaping", () => {
  it("maps thread rows oldest-message-first", async () => {
    const { shapeThread } = await import("@/modules/inquiries/queries");
    const shaped = shapeThread(
      {
        id: "i1",
        clinic_id: "c1",
        subject: "s",
        status: "open",
        preferred_date: null,
        preferred_time_note: null,
        confirmed_date: null,
        caregiver_id: "u1",
        created_at: "2026-08-06T00:00:00Z",
        clinics: { name: "Clinic", slug: "clinic" },
        inquiry_messages: [
          { id: "m2", sender_role: "clinic", body: "b", created_at: "2026-08-06T02:00:00Z" },
          { id: "m1", sender_role: "caregiver", body: "a", created_at: "2026-08-06T01:00:00Z" },
        ],
      },
    );
    expect(shaped.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
