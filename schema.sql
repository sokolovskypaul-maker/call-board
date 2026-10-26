-- Call board: database schema and access rules (Supabase / Postgres).
-- Run once in the Supabase SQL editor. No lead data here: leads are imported from the app by an admin.

create table if not exists public.members (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text,
  role       text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.calls (
  lead_id    text primary key references public.leads (id) on delete cascade,
  rec        jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);

create table if not exists public.config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Membership checks run as definer so policies on members do not recurse.
create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid()); $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid() and role = 'admin'); $$;

alter table public.members enable row level security;
alter table public.leads   enable row level security;
alter table public.calls   enable row level security;
alter table public.config  enable row level security;

-- members: each person sees their own row; admins see everyone. Changes only through the SQL editor.
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- leads and config: members read, admins write.
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated using (public.is_member());
drop policy if exists leads_write on public.leads;
create policy leads_write on public.leads for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists config_read on public.config;
create policy config_read on public.config for select to authenticated using (public.is_member());
drop policy if exists config_write on public.config;
create policy config_write on public.config for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- calls: members read and write call records; nobody deletes from the app.
drop policy if exists calls_read on public.calls;
create policy calls_read on public.calls for select to authenticated using (public.is_member());
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert to authenticated with check (public.is_member());
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update to authenticated using (public.is_member()) with check (public.is_member());

-- Live updates for call records.
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;
