-- Dayline: run this complete file in Supabase SQL Editor. Re-runnable, no data deletion.
begin;
create schema if not exists dayline_private;
revoke all on schema dayline_private from public, anon;
grant usage on schema dayline_private to authenticated;
create table if not exists public.plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 120),notes text not null default '' check(char_length(notes)<=2000),
 plan_date date not null,start_time time not null,end_time time not null,category text not null default 'personal' check(category in ('personal','school','work','health')),
 done boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.plans add column if not exists priority smallint not null default 2 check(priority between 1 and 4);
alter table public.plans add column if not exists color text not null default '#d3656b' check(color ~ '^#[0-9a-fA-F]{6}$');
alter table public.plans add column if not exists participants text not null default '' check(char_length(participants)<=200);
alter table public.plans add column if not exists end_date date;
alter table public.plans add column if not exists status text not null default 'scheduled' check(status in ('scheduled','postponed'));
alter table public.plans add column if not exists important boolean not null default false;
update public.plans set end_date=plan_date where end_date is null;
alter table public.plans drop constraint if exists valid_time_order;
alter table public.plans drop constraint if exists valid_plan_span;
alter table public.plans add constraint valid_plan_span check(coalesce(end_date,plan_date)>plan_date or (coalesce(end_date,plan_date)=plan_date and end_time>start_time));
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(btrim(display_name)) between 1 and 100),
 avatar_url text not null default '' check(char_length(avatar_url)<=2000 and (avatar_url='' or avatar_url like 'https://%'))
);
create table if not exists public.organizations (
 id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 1 and 100),
 owner_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table if not exists public.organization_members (
 organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','member','guest')),created_at timestamptz not null default now(),primary key(organization_id,user_id)
);
alter table public.plans add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
create table if not exists public.plan_assignees (
 plan_id uuid not null references public.plans(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,primary key(plan_id,user_id)
);
create table if not exists public.organization_invites (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 code text not null unique default replace(gen_random_uuid()::text,'-',''),role text not null check(role in ('admin','member','guest')),
 created_by uuid not null references auth.users(id),expires_at timestamptz not null default now()+interval '7 days',used_by uuid references auth.users(id),revoked boolean not null default false
);
create table if not exists public.bulletins (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 sender_id uuid not null default auth.uid() references auth.users(id),recipient_id uuid not null references auth.users(id),
 plan_id uuid references public.plans(id) on delete set null,subject text not null check(char_length(btrim(subject)) between 1 and 120),
 body text not null check(char_length(body) between 1 and 4000),proposed_patch jsonb,base_updated_at timestamptz,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),decided_at timestamptz,
 created_at timestamptz not null default now(),check(sender_id<>recipient_id)
);
create table if not exists public.bulletin_messages (
 id uuid primary key default gen_random_uuid(),bulletin_id uuid not null references public.bulletins(id) on delete cascade,
 sender_id uuid not null default auth.uid() references auth.users(id),body text not null default '' check(char_length(body)<=4000),
 attachments jsonb not null default '[]'::jsonb check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=5),
 created_at timestamptz not null default now(),check(char_length(btrim(body))>0 or jsonb_array_length(attachments)>0)
);
create table if not exists public.plan_edit_sessions (
 session_id uuid primary key,plan_id uuid not null references public.plans(id) on delete cascade,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 editor_name text not null check(char_length(editor_name) between 1 and 100),avatar_url text not null default '' check(char_length(avatar_url)<=2000),expires_at timestamptz not null default now()+interval '30 seconds'
);
alter table public.plan_edit_sessions add column if not exists draft jsonb;
create index if not exists plans_user_date_idx on public.plans(user_id,plan_date,start_time);
create index if not exists plans_org_date_idx on public.plans(organization_id,plan_date);
create index if not exists bulletin_messages_thread_idx on public.bulletin_messages(bulletin_id,created_at);
create index if not exists plan_edit_sessions_plan_idx on public.plan_edit_sessions(plan_id);

-- Helpers read membership without recursive RLS. No helper trusts browser metadata for roles.
create or replace function dayline_private.org_role(org uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.organization_members where organization_id=org and user_id=(select auth.uid());
$$;
create or replace function dayline_private.read_plan(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.plans p where p.id=pid and (
 (p.organization_id is null and p.user_id=(select auth.uid())) or
 (dayline_private.org_role(p.organization_id) in ('admin','member')) or
 (dayline_private.org_role(p.organization_id)='guest' and exists(select 1 from public.plan_assignees a where a.plan_id=p.id and a.user_id=(select auth.uid())))
 ));
$$;
create or replace function dayline_private.edit_plan(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.plans p where p.id=pid and (
 (p.organization_id is null and p.user_id=(select auth.uid())) or dayline_private.org_role(p.organization_id)='admin' or
 (dayline_private.org_role(p.organization_id)='member' and p.user_id=(select auth.uid()))
 ));
$$;
create or replace function dayline_private.read_bulletin(bid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bulletins b where b.id=bid and (b.sender_id=(select auth.uid()) or b.recipient_id=(select auth.uid())) and dayline_private.org_role(b.organization_id) is not null);
$$;
create or replace function dayline_private.shared_profile(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pid=(select auth.uid()) or exists(select 1 from public.organization_members a join public.organization_members b on a.organization_id=b.organization_id where a.user_id=(select auth.uid()) and b.user_id=pid);
$$;
create or replace function dayline_private.file_access(object_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
 begin return dayline_private.read_bulletin(split_part(object_name,'/',1)::uuid);exception when invalid_text_representation then return false;end;
$$;
revoke all on all functions in schema dayline_private from public,anon;
grant execute on all functions in schema dayline_private to authenticated;

-- Enforce immutable ownership and fresh version on every direct plan write.
create or replace function public.plans_touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id then raise exception 'Plāna īpašnieku un organizāciju mainīt nevar.';end if;
 new.updated_at=clock_timestamp();return new;
end;$$;
drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at before update on public.plans for each row execute function public.plans_touch_updated_at();

-- Remove only policies belonging to this app, including the previous version.
drop policy if exists "read own plans" on public.plans;
drop policy if exists "create own plans" on public.plans;
drop policy if exists "edit own plans" on public.plans;
drop policy if exists "delete own plans" on public.plans;
drop policy if exists "dayline read plans" on public.plans;
drop policy if exists "dayline create plans" on public.plans;
drop policy if exists "dayline edit plans" on public.plans;
drop policy if exists "dayline delete plans" on public.plans;
alter table public.plans enable row level security;
revoke all on public.plans from anon;
grant select,insert,update,delete on public.plans to authenticated;
create policy "dayline read plans" on public.plans for select to authenticated using(dayline_private.read_plan(id));
create policy "dayline create plans" on public.plans for insert to authenticated with check(user_id=(select auth.uid()) and (organization_id is null or dayline_private.org_role(organization_id) in ('admin','member')));
create policy "dayline edit plans" on public.plans for update to authenticated using(dayline_private.edit_plan(id)) with check(dayline_private.edit_plan(id));
create policy "dayline delete plans" on public.plans for delete to authenticated using(dayline_private.edit_plan(id));

-- Other app tables: reads through RLS, sensitive mutations only through checked RPCs.
do $$declare t text;begin
 foreach t in array array['profiles','organizations','organization_members','plan_assignees','organization_invites','bulletins','bulletin_messages','plan_edit_sessions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end;$$;
drop policy if exists "dayline profiles" on public.profiles;
create policy "dayline profiles" on public.profiles for select to authenticated using(dayline_private.shared_profile(id));
grant insert,update on public.profiles to authenticated;
drop policy if exists "dayline own profile insert" on public.profiles;
create policy "dayline own profile insert" on public.profiles for insert to authenticated with check(id=(select auth.uid()));
drop policy if exists "dayline own profile update" on public.profiles;
create policy "dayline own profile update" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
drop policy if exists "dayline organizations" on public.organizations;
create policy "dayline organizations" on public.organizations for select to authenticated using(dayline_private.org_role(id) is not null);
drop policy if exists "dayline members" on public.organization_members;
create policy "dayline members" on public.organization_members for select to authenticated using(dayline_private.org_role(organization_id) is not null);
drop policy if exists "dayline assignments" on public.plan_assignees;
create policy "dayline assignments" on public.plan_assignees for select to authenticated using(dayline_private.read_plan(plan_id));
drop policy if exists "dayline invites" on public.organization_invites;
create policy "dayline invites" on public.organization_invites for select to authenticated using(dayline_private.org_role(organization_id)='admin');
drop policy if exists "dayline bulletins" on public.bulletins;
create policy "dayline bulletins" on public.bulletins for select to authenticated using(dayline_private.read_bulletin(id));
drop policy if exists "dayline messages" on public.bulletin_messages;
create policy "dayline messages" on public.bulletin_messages for select to authenticated using(dayline_private.read_bulletin(bulletin_id));
grant insert on public.bulletin_messages to authenticated;
drop policy if exists "dayline send messages" on public.bulletin_messages;
create policy "dayline send messages" on public.bulletin_messages for insert to authenticated with check(sender_id=(select auth.uid()) and dayline_private.read_bulletin(bulletin_id));
drop policy if exists "visible plan editors" on public.plan_edit_sessions;
drop policy if exists "start own edit session" on public.plan_edit_sessions;
drop policy if exists "update own edit session" on public.plan_edit_sessions;
drop policy if exists "end own edit session" on public.plan_edit_sessions;
create policy "visible plan editors" on public.plan_edit_sessions for select to authenticated using(dayline_private.read_plan(plan_id));
grant insert,update,delete on public.plan_edit_sessions to authenticated;
create policy "start own edit session" on public.plan_edit_sessions for insert to authenticated with check(user_id=(select auth.uid()) and expires_at<=now()+interval '45 seconds' and dayline_private.read_plan(plan_id));
create policy "update own edit session" on public.plan_edit_sessions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and expires_at<=now()+interval '45 seconds' and dayline_private.read_plan(plan_id));
create policy "end own edit session" on public.plan_edit_sessions for delete to authenticated using(user_id=(select auth.uid()));

create or replace function public.dayline_create_organization(org_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid;begin
 if auth.uid() is null then raise exception 'Vispirms pieslēdzies.';end if;
 insert into public.organizations(name,owner_id) values(btrim(org_name),auth.uid()) returning id into oid;
 insert into public.organization_members values(oid,auth.uid(),'admin',now());return oid;
end;$$;
create or replace function public.dayline_invite(org uuid,invite_role text) returns text language plpgsql security definer set search_path='' as $$
declare token text;begin
 if dayline_private.org_role(org) is distinct from 'admin' then raise exception 'Nepieciešamas administratora tiesības.';end if;
 insert into public.organization_invites(organization_id,role,created_by) values(org,invite_role,auth.uid()) returning code into token;return token;
end;$$;
create or replace function public.dayline_join(invite_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.organization_invites;begin
 if auth.uid() is null then raise exception 'Vispirms pieslēdzies.';end if;
 select * into inv from public.organization_invites where code=invite_code for update;
 if not found or inv.revoked or inv.used_by is not null or inv.expires_at<now() then raise exception 'Uzaicinājums nav derīgs vai ir izmantots.';end if;
 if dayline_private.org_role(inv.organization_id) is not null then raise exception 'Tu jau esi šajā organizācijā.';end if;
 insert into public.organization_members(organization_id,user_id,role) values(inv.organization_id,auth.uid(),inv.role);
 update public.organization_invites set used_by=auth.uid() where id=inv.id;return inv.organization_id;
end;$$;
create or replace function public.dayline_revoke_invite(invite_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.organization_invites set revoked=true where id=invite_id and dayline_private.org_role(organization_id)='admin';
 if not found then raise exception 'Uzaicinājums nav pieejams.';end if;
end;$$;
create or replace function public.dayline_member(org uuid,member_id uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if dayline_private.org_role(org) is distinct from 'admin' then raise exception 'Nepieciešamas administratora tiesības.';end if;
 perform 1 from public.organizations where id=org and owner_id=member_id;
 if found then raise exception 'Organizācijas īpašnieka piekļuvi mainīt nevar.';end if;
 if new_role is null then
 delete from public.organization_members where organization_id=org and user_id=member_id;
 else update public.organization_members set role=new_role where organization_id=org and user_id=member_id;
 end if;
end;$$;
create or replace function public.dayline_assign(pid uuid,assignees uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 if not dayline_private.edit_plan(pid) then raise exception 'Nav tiesību piešķirt piekļuvi.';end if;
 select organization_id into org from public.plans where id=pid for update;
 if org is null and cardinality(assignees)>0 then raise exception 'Personīgam plānam nevar piešķirt organizācijas dalībniekus.';end if;
 if exists(select 1 from unnest(assignees) a where not exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=a)) then raise exception 'Izvēlies organizācijas dalībniekus.';end if;
 delete from public.plan_assignees where plan_id=pid;
 insert into public.plan_assignees(plan_id,user_id) select pid,a from unnest(assignees) a on conflict do nothing;
end;$$;
-- Optimistic concurrency prevents silently overwriting another user's saved edit.
drop function if exists public.dayline_save_plan(uuid,timestamptz,jsonb);
create or replace function public.dayline_save_plan(pid uuid,expected_updated_at timestamptz,changes jsonb,assignment_ids uuid[] default null) returns public.plans language plpgsql security invoker set search_path='' as $$
declare p public.plans;begin
 select * into p from public.plans where id=pid for update;
 if not found or not dayline_private.edit_plan(pid) then raise exception 'Plāns nav pieejams rediģēšanai.';end if;
 if p.updated_at is distinct from expected_updated_at then raise exception 'Plāns tikko mainīts citā ierīcē. Pārlādē datus un mēģini vēlreiz.';end if;
 update public.plans set title=coalesce(changes->>'title',title),notes=coalesce(changes->>'notes',notes),plan_date=coalesce((changes->>'plan_date')::date,plan_date),end_date=coalesce((changes->>'end_date')::date,end_date),start_time=coalesce((changes->>'start_time')::time,start_time),end_time=coalesce((changes->>'end_time')::time,end_time),priority=coalesce((changes->>'priority')::smallint,priority),color=coalesce(changes->>'color',color),participants=coalesce(changes->>'participants',participants),category=coalesce(changes->>'category',category),done=coalesce((changes->>'done')::boolean,done),status=coalesce(changes->>'status',status),important=coalesce((changes->>'important')::boolean,important) where id=pid returning * into p;
 if assignment_ids is not null then perform public.dayline_assign(pid,assignment_ids);end if;
 return p;
end;$$;
create or replace function public.dayline_insert_plan(org uuid,changes jsonb,assignment_ids uuid[] default null) returns public.plans language plpgsql security invoker set search_path='' as $$
declare p public.plans;begin
 insert into public.plans(organization_id,title,notes,plan_date,end_date,start_time,end_time,priority,color,participants,category,done,status,important)
 values(org,changes->>'title',coalesce(changes->>'notes',''),(changes->>'plan_date')::date,(changes->>'end_date')::date,(changes->>'start_time')::time,(changes->>'end_time')::time,coalesce((changes->>'priority')::smallint,2),coalesce(changes->>'color','#d3656b'),coalesce(changes->>'participants',''),coalesce(changes->>'category','personal'),coalesce((changes->>'done')::boolean,false),coalesce(changes->>'status','scheduled'),coalesce((changes->>'important')::boolean,false)) returning * into p;
 if assignment_ids is not null and org is not null then perform public.dayline_assign(p.id,assignment_ids);end if;
 return p;
end;$$;
create or replace function public.dayline_create_bulletin(org uuid,recipient uuid,plan uuid,heading text,description text,proposal jsonb default null,base_version timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;begin
 if dayline_private.org_role(org) is null then raise exception 'Organizācija nav pieejama.';end if;
 if not exists(select 1 from public.organization_members where organization_id=org and user_id=recipient and role='admin') then raise exception 'Izvēlies organizācijas administratoru.';end if;
 if plan is not null and (not dayline_private.read_plan(plan) or not exists(select 1 from public.plans where id=plan and organization_id=org)) then raise exception 'Plāns nav pieejams šajā organizācijā.';end if;
 if proposal is not null and (plan is null or base_version is null or jsonb_typeof(proposal)<>'object') then raise exception 'Izmaiņu pieprasījumam vajadzīgs plāns un tā versija.';end if;
 insert into public.bulletins(organization_id,sender_id,recipient_id,plan_id,subject,body,proposed_patch,base_updated_at) values(org,auth.uid(),recipient,plan,btrim(heading),description,proposal,base_version) returning id into bid;return bid;
end;$$;
create or replace function public.dayline_decide(bid uuid,accept_request boolean) returns void language plpgsql security definer set search_path='' as $$
declare b public.bulletins;p public.plans;c jsonb;begin
 select * into b from public.bulletins where id=bid for update;
 if not found or b.recipient_id is distinct from auth.uid() or dayline_private.org_role(b.organization_id) is distinct from 'admin' then raise exception 'Lēmumu var pieņemt tikai norādītais administrators.';end if;
 if b.status<>'pending' then raise exception 'Lēmums jau ir pieņemts.';end if;
 if accept_request and b.proposed_patch is not null then
 select * into p from public.plans where id=b.plan_id for update;
 if not found or p.organization_id is distinct from b.organization_id then raise exception 'Piesaistītais plāns vairs nav pieejams.';end if;
 if p.updated_at is distinct from b.base_updated_at then raise exception 'Plāns ir mainīts kopš pieprasījuma. Jāiesniedz jauns pieprasījums.';end if;
 c=b.proposed_patch;
 update public.plans set title=coalesce(c->>'title',title),notes=coalesce(c->>'notes',notes),plan_date=coalesce((c->>'plan_date')::date,plan_date),end_date=coalesce((c->>'end_date')::date,end_date),start_time=coalesce((c->>'start_time')::time,start_time),end_time=coalesce((c->>'end_time')::time,end_time),priority=coalesce((c->>'priority')::smallint,priority),color=coalesce(c->>'color',color),participants=coalesce(c->>'participants',participants),status=coalesce(c->>'status',status),important=coalesce((c->>'important')::boolean,important) where id=p.id;
 end if;
 update public.bulletins set status=case when accept_request then 'accepted' else 'declined' end,decided_at=now() where id=bid;
end;$$;

-- Explicit function exposure: anonymous calls cannot create orgs, join, decide, or mutate roles.
revoke execute on function public.dayline_create_organization(text), public.dayline_invite(uuid,text),public.dayline_join(text),public.dayline_revoke_invite(uuid),public.dayline_member(uuid,uuid,text),public.dayline_assign(uuid,uuid[]),public.dayline_save_plan(uuid,timestamptz,jsonb,uuid[]),public.dayline_insert_plan(uuid,jsonb,uuid[]),public.dayline_create_bulletin(uuid,uuid,uuid,text,text,jsonb,timestamptz),public.dayline_decide(uuid,boolean) from public,anon;
grant execute on function public.dayline_create_organization(text), public.dayline_invite(uuid,text),public.dayline_join(text),public.dayline_revoke_invite(uuid),public.dayline_member(uuid,uuid,text),public.dayline_assign(uuid,uuid[]),public.dayline_save_plan(uuid,timestamptz,jsonb,uuid[]),public.dayline_insert_plan(uuid,jsonb,uuid[]),public.dayline_create_bulletin(uuid,uuid,uuid,text,text,jsonb,timestamptz),public.dayline_decide(uuid,boolean) to authenticated;

-- Private files. Paths are <bulletin UUID>/<uploader UUID>/<unique filename>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('dayline-attachments','dayline-attachments',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','text/plain']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "dayline attachment read" on storage.objects;
create policy "dayline attachment read" on storage.objects for select to authenticated using(bucket_id='dayline-attachments' and dayline_private.file_access(name));
drop policy if exists "dayline attachment upload" on storage.objects;
create policy "dayline attachment upload" on storage.objects for insert to authenticated with check(bucket_id='dayline-attachments' and split_part(name,'/',2)=(select auth.uid())::text and dayline_private.file_access(name));
drop policy if exists "dayline attachment cleanup" on storage.objects;
create policy "dayline attachment cleanup" on storage.objects for delete to authenticated using(bucket_id='dayline-attachments' and split_part(name,'/',2)=(select auth.uid())::text and dayline_private.file_access(name));
notify pgrst,'reload schema';
commit;
