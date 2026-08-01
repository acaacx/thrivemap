# RLS policies

Every table has RLS enabled. Policies live in
`supabase/migrations/20260801000006_rls.sql` (plus `…000012` for claim
updates); explicit grants in `…000008_grants.sql` — **new tables get no
anon/authenticated grants until added there**. This file is the human
summary; the SQL is authoritative.

## Principles

1. Public sees only published listings and the reference taxonomy.
2. Users see and mutate only their own contributions.
3. Moderators/administrators read moderation queues via the
   `is_moderator_or_admin()` helper; clinic managers via
   `manages_clinic(clinic_id)`.
4. Infrastructure tables (jobs, candidates, audit) have no public surface —
   service role only, or admin-read at most.
5. App-layer checks (`requireRole`) duplicate all of this; RLS is the
   backstop, not the only line.

## Summary by table group

| Table(s)                                                                           | anon               | authenticated                                 | manager           | moderator/admin                      |
| ---------------------------------------------------------------------------------- | ------------------ | --------------------------------------------- | ----------------- | ------------------------------------ |
| `clinics` + satellites (locations, hours, images, services, …)                     | read published     | read published                                | update own clinic | insert/delete, update any            |
| `services`, `ph_locations`, `clinic_search_documents`                              | read               | read                                          | —                 | write (services)                     |
| `profiles`, `user_preferences`                                                     | —                  | own row                                       | —                 | —                                    |
| `user_roles`                                                                       | —                  | own rows read                                 | —                 | admin manages (server-side)          |
| `favorites`                                                                        | —                  | owner all                                     | —                 | —                                    |
| `clinic_submissions`                                                               | insert (anonymous) | insert + own read                             | —                 | read all, update                     |
| `clinic_change_requests`                                                           | —                  | insert + own read                             | —                 | read all, update                     |
| `clinic_reports`                                                                   | insert (anonymous) | insert + own read                             | —                 | read all, update                     |
| `clinic_claims`                                                                    | —                  | own insert/read; update while draft/more-info | —                 | read all, decide                     |
| `clinic_claim_documents`                                                           | —                  | own insert/read (metadata only)               | —                 | read via service role, audited       |
| `clinic_managers`                                                                  | —                  | own rows read                                 | —                 | granted via claim approval           |
| `clinic_verification_records/events`                                               | —                  | —                                             | —                 | moderator                            |
| `external_place_candidates`, `clinic_source_records`, `duplicate_match_candidates` | —                  | —                                             | —                 | moderator                            |
| `admin_actions`, `audit_logs`                                                      | —                  | —                                             | —                 | admin read; inserts append-only      |
| `jobs`                                                                             | —                  | —                                             | —                 | admin read (writes via service role) |

## Storage

| Bucket                      | Read                                            | Write                                            |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `clinic-images` (public)    | anyone                                          | manager/moderator, path-scoped `<clinic_id>/...` |
| `claim-documents` (private) | signed URLs only (server-issued, 60 s, audited) | owner, path-scoped `<user_id>/<claim_id>/...`    |

## Testing

`tests/integration/rls.test.ts` asserts the ownership matrix with real
anon/user/moderator clients: cross-user reads fail, anonymous writes hit
only the allowed tables, and published-only visibility holds.
