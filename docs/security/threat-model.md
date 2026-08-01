# Threat model

Scope: Phase 1 public directory. The most sensitive assets are **claim
verification documents** (business papers, IDs), **user accounts/emails**,
and **listing integrity** (families rely on the data).

## Threats and mitigations

### T1 — Listing vandalism / fake clinics

Attacker publishes fake or malicious listings, or defaces real ones.

- Nothing publishes without moderator review (submissions → approval flow).
- Edits to published listings flow as change requests unless the editor is a
  verified, claim-approved manager; direct edits are audit-logged.
- Anonymous reports + stale-listing detection surface bad data.
- Lifecycle state machine + DB constraints prevent illegal status jumps.

### T2 — Fraudulent ownership claims

Attacker claims a clinic they don't own to control its public profile.

- Claims require documents + manual verification; "request more info" state
  for weak evidence; decisions recorded with reason in `admin_actions`.
- Documents live in a private bucket, path-scoped per user
  (`<user_id>/<claim_id>/...`) with storage RLS; reads only via short-lived
  (60 s) signed URLs generated server-side, each access audited.

### T3 — Data exfiltration via API/RLS gaps

Attacker uses the anon key directly against PostgREST.

- RLS on every table; hardened defaults mean new tables have no grants until
  explicitly added (migration 8).
- Integration tests assert the RLS ownership matrix (anon/user A/user B/
  moderator) per table.
- Claim documents, reports, audit rows, and candidate tables are never
  readable through public policies.

### T4 — Spam / abuse of public mutations

Bulk fake submissions, reports, or signup floods.

- Rate limiting on every public mutation (`RateLimiter`, hashed
  identifiers); fail-open by design but logged.
- Anonymous submitters get no read-back; idempotent job processing prevents
  email storms; moderator queues make volume visible.

### T5 — Account takeover

- Supabase Auth (bcrypt, email confirmation); sign-in rate-limited; sessions
  are httpOnly cookies refreshed in middleware; no tokens in logs
  (redaction backstop in logger).

### T6 — XSS / injection

- React escaping end-to-end; zod validation on every action input; SQL only
  via parameterized PostgREST/RPC. CSP restricts script/connect origins
  (see [security-posture.md](security-posture.md)); `X-Frame-Options: DENY`.

### T7 — CSRF on server actions

- Next.js server actions enforce same-origin (Origin/Host check) POSTs;
  cookies are SameSite=Lax. No state-changing GET routes. Documented in
  [security-posture.md](security-posture.md).

### T8 — Job processor abuse

`/api/internal/jobs/process` triggers arbitrary handler work.

- Requires `x-jobs-secret` header; refuses to run in production without the
  secret configured. Handlers only act on queue rows — the payload cannot
  name arbitrary code.

### T9 — Secret leakage

- Service-role key is server-only (`server-only` imports guard the client
  modules); CI runs gitleaks + dependency audit + Semgrep; `.env*` is
  gitignored; logger redacts token-shaped keys.

### T10 — Privacy of families (highest-sensitivity users)

Users searching for autism services reveal sensitive family circumstances.

- Precise user location never stored or logged (redaction includes lat/lng);
  "Use My Location" is browser-side with an explainer, coordinates go into
  the URL only as search parameters the user controls.
- Analytics is event-name only, no PII; email identifiers hashed in rate
  limiter storage.
- See [data-classification.md](data-classification.md).

## Non-goals (Phase 1)

DDoS resistance beyond platform defaults (Cloudflare documented but not
configured), formal pen-test, SOC2-style controls, and medical-data
handling (the product stores none).
