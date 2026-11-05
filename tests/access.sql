-- Optional integration checks. Run AFTER collaboration.sql as postgres in SQL Editor.
-- All test users and records are rolled back; requires a non-production verification session.
begin;
create temporary table dl_checks(key text primary key,value text);
grant select,insert,update on dl_checks to authenticated;
insert into dl_checks values('admin',gen_random_uuid()::text),('member',gen_random_uuid()::text),('guest',gen_random_uuid()::text),('outsider',gen_random_uuid()::text);
insert into auth.users(id,email) select value::uuid,'dayline-check-'||value||'@example.invalid' from dl_checks;
create function pg_temp.actor(actor_key text) returns void language plpgsql as $$declare actor_id text;begin
 select value into actor_id from dl_checks where key=actor_key;
 perform set_config('request.jwt.claim.sub',actor_id,true);
 perform set_config('request.jwt.claims',json_build_object('sub',actor_id,'role','authenticated')::text,true);
end;$$;
create function pg_temp.check_true(ok boolean,description text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'CHECK FAILED: %',description;end if;end;$$;
set local role authenticated;
select pg_temp.actor('admin');
insert into dl_checks select 'org',public.dayline_create_organization('Dayline integration check')::text;
insert into dl_checks select 'member_invite',public.dayline_invite((select value::uuid from dl_checks where key='org'),'member');
insert into dl_checks select 'guest_invite',public.dayline_invite((select value::uuid from dl_checks where key='org'),'guest');
insert into dl_checks select 'plan',(public.dayline_insert_plan((select value::uuid from dl_checks where key='org'),'{"title":"Integration check","plan_date":"2030-01-01","end_date":"2030-01-01","start_time":"12:00","end_time":"13:00"}'::jsonb)).id::text;
select pg_temp.actor('member');
select public.dayline_join((select value from dl_checks where key='member_invite'));
select pg_temp.check_true((select count(*)=1 from public.plans where id=(select value::uuid from dl_checks where key='plan')),'member can read organization plan');
select pg_temp.check_true(not dayline_private.edit_plan((select value::uuid from dl_checks where key='plan')),'member cannot edit admin plan');
do $$declare denied boolean:=false;begin
 begin perform public.dayline_member((select value::uuid from dl_checks where key='org'),auth.uid(),'admin');exception when raise_exception then denied=true;end;
 perform pg_temp.check_true(denied,'member cannot promote themselves');
end;$$;
insert into dl_checks select 'ticket',public.dayline_create_bulletin((select value::uuid from dl_checks where key='org'),(select value::uuid from dl_checks where key='admin'),p.id,'Integration request','Integration description','{"start_time":"12:30","end_time":"13:30"}'::jsonb,p.updated_at)::text from public.plans p where p.id=(select value::uuid from dl_checks where key='plan');
select pg_temp.actor('guest');
select public.dayline_join((select value from dl_checks where key='guest_invite'));
select pg_temp.check_true((select count(*)=0 from public.plans where id=(select value::uuid from dl_checks where key='plan')),'unassigned guest cannot read plan');
select pg_temp.check_true((select count(*)=0 from public.bulletins),'guest cannot read another private thread');
select pg_temp.actor('admin');
select public.dayline_assign((select value::uuid from dl_checks where key='plan'),array[(select value::uuid from dl_checks where key='guest')]);
select pg_temp.actor('guest');
select pg_temp.check_true(dayline_private.read_plan((select value::uuid from dl_checks where key='plan')),'assigned guest can read plan');
select pg_temp.check_true(not dayline_private.edit_plan((select value::uuid from dl_checks where key='plan')),'assigned guest cannot edit plan');
select pg_temp.actor('outsider');
select pg_temp.check_true((select count(*)=0 from public.plans),'outsider cannot read organization plans');
select pg_temp.check_true((select count(*)=0 from public.organization_members),'outsider cannot read members');
select pg_temp.check_true(not dayline_private.file_access((select value from dl_checks where key='ticket')||'/file.docx'),'outsider cannot read private attachment');
select pg_temp.actor('admin');
select public.dayline_decide((select value::uuid from dl_checks where key='ticket'),true);
select pg_temp.check_true((select start_time='12:30'::time from public.plans where id=(select value::uuid from dl_checks where key='plan')),'accept applies proposed time');
select pg_temp.check_true((select status='accepted' from public.bulletins where id=(select value::uuid from dl_checks where key='ticket')),'accept resolves ticket');
select pg_temp.actor('member');
select pg_temp.check_true(dayline_private.file_access((select value from dl_checks where key='ticket')||'/file.docx'),'sender can read private attachment');
do $$declare denied boolean:=false;begin
 begin perform public.dayline_join((select value from dl_checks where key='guest_invite'));exception when raise_exception then denied=true;end;
 perform pg_temp.check_true(denied,'single-use invite cannot be reused');
end;$$;
reset role;
rollback;
