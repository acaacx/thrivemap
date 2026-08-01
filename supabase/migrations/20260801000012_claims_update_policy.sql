-- ThriveMap: fix claim submission under RLS.
-- The original "own update draft" policy had no WITH CHECK, so Postgres
-- reused the USING expression for the new row — meaning a claimant could
-- never move their claim from draft to submitted. Split the old-row and
-- new-row conditions explicitly.

drop policy "clinic_claims: own update draft" on public.clinic_claims;

create policy "clinic_claims: own update draft" on public.clinic_claims
  for update using (
    (auth.uid() = user_id and status in ('draft', 'additional_information_required'))
    or public.is_moderator_or_admin()
  )
  with check (
    (auth.uid() = user_id and status in ('draft', 'submitted'))
    or public.is_moderator_or_admin()
  );
