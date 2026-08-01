# Data classification

| Class            | Data                                                                                                      | Handling                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Restricted**   | Claim verification documents (business papers, IDs); `SUPABASE_SERVICE_ROLE_KEY` and other server secrets | Private bucket, signed URLs (60 s), per-access audit; secrets server-only, zod-validated, never logged |
| **Confidential** | User emails, password hashes (Supabase Auth), report submitter identities, moderation reasons, audit logs | RLS owner/moderator-only; identifiers hashed in rate-limit storage; not exposed through any public API |
| **Internal**     | Job queue rows, duplicate-match candidates, external place candidates, admin metrics                      | Service-role only; no anon/authenticated grants                                                        |
| **Public**       | Published clinic listings (name, address, services, hours, contacts), service taxonomy, `ph_locations`    | Public read via RLS; this is the product                                                               |

Notes:

- **The product stores no medical records and no child data.** Favorites and
  searches imply interest in autism services — treat any user-linked
  behavioral data (favorites, submissions) as Confidential, never sold or
  exported.
- Precise user geolocation is never persisted or logged; it exists only in
  the browser and in user-visible URL search params.
- Deleted clinics are soft-deleted (`deleted_at`) and drop out of every
  public query; hard deletion is a manual DBA action.
