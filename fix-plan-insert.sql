-- Run this small fix in Supabase SQL Editor. Existing data and RLS stay enabled.
begin;
drop policy if exists "dayline read plans" on public.plans;
create policy "dayline read plans" on public.plans for select to authenticated using(
 (organization_id is null and user_id=(select auth.uid())) or
 dayline_private.org_role(organization_id) in ('admin','member') or
 (dayline_private.org_role(organization_id)='guest' and exists(
   select 1 from public.plan_assignees a where a.plan_id=plans.id and a.user_id=(select auth.uid())
 ))
);
notify pgrst,'reload schema';
commit;
