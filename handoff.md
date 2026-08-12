# Handoff — ThriveMap (DevSwarm workspace, branch `UI`)

## What we were trying to do

Two-part user request in this workspace: (1) remove the "Feeding Therapy"
service, (2) modernize the service pages + homepage services section with an
autism-care-appropriate theme. Decisions locked via AskUserQuestion: **hard
delete** (cascade accepted), scope = `/services/[slug]` template + homepage
"Browse by service" grid, theme = **evolve Warm Horizon** (no palette/font
changes), direction named **"Warm Horizon — Calm Clarity"**.

## Finished and verified

Both workstreams COMPLETE, committed on branch `UI`, tree clean:

- `064b1e8` feat(db): `supabase/migrations/20260813000022_remove_feeding_therapy_service.sql`
  — hard delete + `raise notice` cascade count + behavioral-therapy icon
  `puzzle` → `blocks` (no puzzle-piece motifs rule). Verified against local DB
  in a **rolled-back transaction**: 13 associations drop, 7 services remain.
  Seed migration 16 deliberately untouched (16 inserts, 22 deletes — db reset
  converges).
- `cdc5344` feat(ui): service page rewrite (`src/app/services/[slug]/page.tsx`:
  gradient hero + accent orb, breadcrumb, icon tile, stat chips with honest
  "20+" count via `nextCursor`, dual CTAs, empty state, "Explore other
  services" pills), homepage grid (`src/app/page.tsx`: icon tiles, ring cards,
  reduced-motion-safe hover lift, "See every clinic" CTA tile), 2 new tokens
  only in `globals.css` (`--ease-calm`, `--shadow-soft` per-scheme), new
  `src/modules/clinics/service-icons.ts` (+test) and `service-glyph.tsx`.

Verification all green: `pnpm typecheck`, `lint`, `test` (122), `format:check`,
`pnpm build` with CI placeholder env, `PW_WORKERS=2 npx playwright test
e2e/public-directory.spec.ts e2e/accessibility.spec.ts --project=chromium`
(15/15, incl. axe on both redesigned pages), browse screenshots clean, no
console errors.

Plan file: `/Users/alaric/.claude/plans/splendid-wandering-haven.md`.

## Half-done / not started

- Nothing half-done in code. NOT pushed; NOT merged into source branch.
- Local shared Supabase (ausomeapp containers, ports 54321/54322) still HAS
  feeding-therapy — migration test rolled back on purpose. It applies for real
  via CI on merge to main.

## Single next action

Before merging to main: snapshot the prod blast radius in Supabase SQL editor
(irreversible cascade):

```sql
select c.slug, c.name from clinic_services cs
join services s on s.id = cs.service_id
join clinics c on c.id = cs.clinic_id
where s.slug = 'feeding-therapy' order by c.name;
```

Then merge/push. CI `migrate` job needs `DEPLOY_ENABLED=true` repo var +
`production` environment approval; Vercel deploys independently of that gate.

## Decisions already made (do not relitigate)

- Hard delete, not is_active flag (user chose, cascade loss accepted).
- Warm Horizon stays; evolution only. No new fonts, no palette edits, new
  tints derive from existing vars.
- No exact clinic-count query on service pages (RLS per-row cost) — "20+"
  label from `nextCursor` is the accepted fix for the page-size-as-total lie.
- behavioral-therapy icon rename bundled into the delete migration.
- ClinicCard untouched (shared on 4+ pages).

## Traps / non-obvious facts

- **react-hooks/static-components** flags `const Icon = serviceIcon(...)` +
  JSX in any component body (even a wrapper). `service-glyph.tsx` uses
  `createElement` to dodge it — keep that form.
- Build needs env: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key
  SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-key pnpm build` (mirrors
  main.yml). This worktree's `.env.local` (untracked) holds real local keys
  from `pnpm exec supabase status`.
- shadcn here is **Base UI**: `render={<Link/>}`, never `asChild`.
- Tailwind v4 CSS-first — no tailwind.config; tokens in `@theme inline` in
  `src/app/globals.css`; global reduced-motion reset zeroes duration but NOT
  transforms → hover translates need `motion-reduce:hover:translate-y-0`.
- e2e depends on exact homepage heading "Browse by service" + service name in
  the anchor's accessible name (icon spans are `aria-hidden`).
- `pnpm test:integration -- <pattern>` does NOT filter — use
  `npx vitest run --config vitest.integration.config.ts <file>`.
- Editing applied migrations forbidden; next migration number is global
  counter (latest now 22).
- Homepage grid reads as clean 2×4 only AFTER migration lands in prod (until
  then 8 services + CTA = 9 tiles, cosmetic only; legacy `puzzle`→Blocks map
  entry covers the icon during the window; unknown icons fall back to
  Sparkles — feeding's `utensils` renders as Sparkles until deleted).
- `handoff.md` is in `.prettierignore` (hook-regenerated) — leave it there.
- Stale `.next` after route changes → phantom typecheck errors; `rm -rf .next`.
