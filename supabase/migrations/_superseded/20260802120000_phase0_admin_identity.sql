-- =============================================================================
-- PHASE 0 / 1 of 5 — ADMIN IDENTITY
--
-- Problem this fixes (P0-2):
--   "Admin" was defined in three incompatible places:
--     1. a hardcoded email array in src/lib/admin-service.ts (and again in the KYC route)
--     2. profiles.is_host = true          <-- USER-WRITABLE. Self-service admin.
--     3. a hardcoded email in the fps_events RLS policy
--   Because profiles had a blanket UPDATE grant, any user could set is_host = true on
--   themselves and immediately pass the admin check inside approve_kyc_request() and the
--   kyc_documents storage policies — i.e. approve their own identity verification and read
--   every other user's government ID.
--
-- After this migration there is exactly one source of truth: public.admin_users.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Admin roster
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    email      text not null,
    role       text not null default 'admin' check (role in ('admin', 'superadmin')),
    notes      text,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users(id)
);

comment on table public.admin_users is
    'Single source of truth for admin privilege. Writable only by service_role (server-side), '
    'never by anon or authenticated. Do not reintroduce profiles.is_host as an authorization signal.';

alter table public.admin_users enable row level security;

-- -----------------------------------------------------------------------------
-- 2. is_admin() — the one authorization helper
--
--    security definer so it can read admin_users regardless of the caller's RLS.
--    search_path is pinned: without it a caller controlling their search_path could
--    shadow `admin_users` with their own table and return true. None of the legacy
--    security definer functions pin it; every function this migration set touches now does.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.admin_users a where a.user_id = p_user_id
    );
$$;

comment on function public.is_admin(uuid) is
    'Returns true when the given user (default: current caller) is an admin. '
    'The only sanctioned admin check. No table owner RLS recursion: security definer '
    'runs as the table owner, which bypasses RLS on admin_users.';

-- Admin RPCs are invoked from Next.js server actions using the service role key, where
-- there is no JWT and auth.uid() is therefore null. is_admin() alone would reject those
-- calls and break the admin panel.
--
-- Holding the service role key already implies full trust — it bypasses RLS entirely —
-- so accepting it here grants nothing new. It does mean the *application* must
-- authenticate the operator before it calls these: see requireAdmin() in
-- src/lib/admin-auth.ts, which every admin server action now goes through.
create or replace function public.is_admin_or_service()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        public.is_admin()
        or coalesce(
            current_setting('request.jwt.claims', true)::jsonb ->> 'role',
            ''
        ) = 'service_role';
$$;

comment on function public.is_admin_or_service() is
    'Authorization check for admin RPCs: a signed-in admin, or a server-side caller '
    'using the service role key. Never call this from a function reachable by anon.';

-- Admins can see the roster. Nobody can write it through PostgREST at all
-- (no insert/update/delete policy exists, and the grants below are select-only),
-- so membership changes go through service_role / SQL editor only.
drop policy if exists "Admins read admin_users" on public.admin_users;
create policy "Admins read admin_users" on public.admin_users
    for select using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Admin audit log
--
--    Pulled forward from Phase 2: every admin RPC in migration 3 of this set writes here.
--    Privileged money operations must not be un-attributable.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
    id          uuid primary key default gen_random_uuid(),
    actor_id    uuid references auth.users(id) on delete set null,
    actor_email text,
    action      text not null,
    target_type text,
    target_id   uuid,
    amount      numeric(12,2),
    reason      text,
    metadata    jsonb not null default '{}',
    created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx      on public.admin_audit_log (actor_id);
create index if not exists admin_audit_log_target_idx     on public.admin_audit_log (target_type, target_id);

comment on table public.admin_audit_log is
    'Append-only record of privileged actions. No UPDATE/DELETE policy exists by design.';

alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log" on public.admin_audit_log
    for select using (public.is_admin());

-- Internal helper used by the admin RPCs. Not exposed to clients.
create or replace function public.log_admin_action(
    p_action      text,
    p_target_type text default null,
    p_target_id   uuid default null,
    p_amount      numeric default null,
    p_reason      text default null,
    p_metadata    jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_email text;
begin
    select email into v_email from public.admin_users where user_id = auth.uid();

    insert into public.admin_audit_log (
        actor_id, actor_email, action, target_type, target_id, amount, reason, metadata
    )
    values (
        auth.uid(),
        coalesce(v_email, 'service_role'),
        p_action, p_target_type, p_target_id, p_amount, p_reason, coalesce(p_metadata, '{}')
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Seed the roster from the previously hardcoded list
--
--    Matches on auth.users so the row only lands if the account actually exists.
--    If this inserts 0 rows, the admin has not signed up yet under that address —
--    re-run this block after they do, or insert manually.
-- -----------------------------------------------------------------------------
insert into public.admin_users (user_id, email, role, notes)
select u.id, u.email, 'superadmin', 'Seeded by Phase 0 migration from legacy ADMIN_EMAILS'
from auth.users u
where lower(u.email) = lower('temiadebayo1@gmail.com')
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Repoint fps_events RLS off the hardcoded email
-- -----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.fps_events') is not null then
        execute 'drop policy if exists "Admins can read fps_events" on public.fps_events';
        execute 'create policy "Admins can read fps_events" on public.fps_events
                     for select to authenticated using (public.is_admin())';
    end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Repoint the KYC document storage policies off profiles.is_host
--
--    These are the policies that let an admin read uploaded IDs and selfies.
--    While is_host was user-writable, so was access to every user's identity documents.
-- -----------------------------------------------------------------------------
drop policy if exists "Admins can view all KYC docs" on storage.objects;
create policy "Admins can view all KYC docs" on storage.objects
    for select using (bucket_id = 'kyc_documents' and public.is_admin());

drop policy if exists "Admins can delete KYC docs" on storage.objects;
create policy "Admins can delete KYC docs" on storage.objects
    for delete using (bucket_id = 'kyc_documents' and public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. Neutralise is_host as an authorization signal
--
--    The column is left in place (harmless, and other code reads it as a display flag),
--    but every policy and function that trusted it is repointed at is_admin() here and
--    in migration 3. Any user who already set it on themselves is reset.
-- -----------------------------------------------------------------------------
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_host'
    ) then
        update public.profiles p
        set is_host = false
        where p.is_host = true
          and not exists (select 1 from public.admin_users a where a.user_id = p.id);
    end if;
end $$;

drop policy if exists "Admins can view all kyc requests" on public.kyc_requests;
create policy "Admins can view all kyc requests" on public.kyc_requests
    for select using (public.is_admin());

drop policy if exists "Admins can update all kyc requests" on public.kyc_requests;
create policy "Admins can update all kyc requests" on public.kyc_requests
    for update using (public.is_admin());

commit;

select 'Phase 0 / 1 of 5 — admin identity consolidated into public.admin_users' as result;
