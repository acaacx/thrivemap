import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cachedClinicData } from "@/modules/shared/cache";
import type { InquiryStatus } from "./schemas";

export interface InquiryMessageItem {
  id: string;
  senderRole: "caregiver" | "clinic";
  body: string;
  createdAt: string;
}

export interface InquiryThread {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  subject: string;
  status: InquiryStatus;
  preferredDate: string | null;
  preferredTimeNote: string | null;
  confirmedDate: string | null;
  caregiverId: string;
  createdAt: string;
  messages: InquiryMessageItem[];
}

export interface InquiryListItem {
  id: string;
  subject: string;
  status: InquiryStatus;
  createdAt: string;
  clinicName: string;
  clinicSlug: string;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export interface ClinicInquiryListItem {
  id: string;
  subject: string;
  status: InquiryStatus;
  preferredDate: string | null;
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
}

interface ThreadRow {
  id: string;
  clinic_id: string;
  subject: string;
  status: string;
  preferred_date: string | null;
  preferred_time_note: string | null;
  confirmed_date: string | null;
  caregiver_id: string;
  created_at: string;
  clinics: { name: string; slug: string } | null;
  inquiry_messages: Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }>;
}

const THREAD_SELECT =
  "id, clinic_id, subject, status, preferred_date, preferred_time_note, confirmed_date, caregiver_id, created_at, clinics(name, slug), inquiry_messages(id, sender_role, body, created_at)";

function preview(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}

/** Exported for unit tests — orders messages oldest-first. */
export function shapeThread(row: ThreadRow): InquiryThread {
  const messages = [...row.inquiry_messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({
      id: m.id,
      senderRole: m.sender_role as "caregiver" | "clinic",
      body: m.body,
      createdAt: m.created_at,
    }));
  return {
    id: row.id,
    clinicId: row.clinic_id,
    clinicName: row.clinics?.name ?? "Unknown clinic",
    clinicSlug: row.clinics?.slug ?? "",
    subject: row.subject,
    status: row.status as InquiryStatus,
    preferredDate: row.preferred_date,
    preferredTimeNote: row.preferred_time_note,
    confirmedDate: row.confirmed_date,
    caregiverId: row.caregiver_id,
    createdAt: row.created_at,
    messages,
  };
}

/**
 * True when the clinic has at least one active manager.
 *
 * Uses the admin client on purpose: RLS on clinic_managers ("own read")
 * only lets a caller see rows where they themselves are the manager, so a
 * caregiver's own RLS-scoped client always sees a count of 0 here — the
 * inquiry CTA would report every claimed clinic as unclaimed. This function
 * only ever returns a boolean (no row data leaves it), so bypassing RLS to
 * compute that boolean is safe.
 */
export async function clinicAcceptsInquiries(
  clinicId: string,
): Promise<boolean> {
  return cachedClinicData(`inquiries-accepts|${clinicId}`, 300, async () => {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase
      .from("clinic_managers")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("revoked_at", null);
    return (count ?? 0) > 0;
  });
}

/**
 * Caregiver dashboard: own threads only, newest activity first. RLS also
 * grants read access to the clinic's managers, so this needs its own
 * caregiver_id filter — without it, a manager reading this function would
 * see every thread on their clinic instead of just their own inquiries.
 */
export async function listMyInquiries(): Promise<InquiryListItem[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .eq("caregiver_id", user.id);
  const items = ((data ?? []) as unknown as ThreadRow[]).map((row) => {
    const thread = shapeThread(row);
    const last = thread.messages[thread.messages.length - 1];
    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      createdAt: thread.createdAt,
      clinicName: thread.clinicName,
      clinicSlug: thread.clinicSlug,
      lastMessageAt: last?.createdAt ?? thread.createdAt,
      lastMessagePreview: last ? preview(last.body) : "",
    };
  });
  return items.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Portal inbox: one clinic's threads, open first, then newest activity. */
export async function listClinicInquiries(
  clinicId: string,
  statusFilter?: InquiryStatus,
): Promise<ClinicInquiryListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .eq("clinic_id", clinicId);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data } = await query;
  const items = ((data ?? []) as unknown as ThreadRow[]).map((row) => {
    const thread = shapeThread(row);
    const last = thread.messages[thread.messages.length - 1];
    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      preferredDate: thread.preferredDate,
      createdAt: thread.createdAt,
      lastMessageAt: last?.createdAt ?? thread.createdAt,
      lastMessagePreview: last ? preview(last.body) : "",
    };
  });
  return items.sort((a, b) => {
    const aOpen = a.status === "open" ? 0 : 1;
    const bOpen = b.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

/** Full thread; null when RLS hides it or it doesn't exist. */
export async function getInquiryThread(
  inquiryId: string,
): Promise<InquiryThread | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return null;
  return shapeThread(data as unknown as ThreadRow);
}
