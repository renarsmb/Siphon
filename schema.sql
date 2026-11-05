-- Run in Supabase SQL Editor. All tasks belong to their authenticated creator.
begin;
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  plan_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  category text not null default 'personal' check (category in ('personal','school','work','health')),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_order check (end_time > start_time)
);
create index if not exists plans_user_date_idx on public.plans (user_id, plan_date, start_time);
alter table public.plans enable row level security;
revoke all on public.plans from anon;
grant select, insert, update, delete on public.plans to authenticated;
drop policy if exists "read own plans" on public.plans;
drop policy if exists "create own plans" on public.plans;
drop policy if exists "edit own plans" on public.plans;
drop policy if exists "delete own plans" on public.plans;
create policy "read own plans" on public.plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own plans" on public.plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "edit own plans" on public.plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own plans" on public.plans for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.plans_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$begin new.updated_at = now(); return new; end;$$;
drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at before update on public.plans for each row execute function public.plans_touch_updated_at();
commit;
