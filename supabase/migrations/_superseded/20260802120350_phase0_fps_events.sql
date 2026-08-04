-- =============================================================================
-- PHASE 0 / 4.5 of 5 — FAIRPLAY EVENT LOG
--
-- Supersedes the loose supabase/fps_events.sql, which was written but never applied
-- to the database — the table did not exist, so the lockdown migration failed on it.
--
-- This is not optional any more. Two code paths now write to fps_events on a rejected
-- score, and both would raise instead of returning a clean rejection if it were missing:
--   * submit_score()                        (20260802120300_phase0_write_rpcs.sql)
--   * PUT /api/giveaways/[id]/guest-join    (server-side guest scoring)
--
-- Runs before the lockdown migration so the grants in that file have a table to target.
-- =============================================================================

begin;

create table if not exists public.fps_events (
    id             uuid        primary key default gen_random_uuid(),
    user_id        uuid        references public.profiles(id) on delete set null,
    fingerprint_id text,
    event_name     text        not null,
    category       text        not null check (category in ('analytics', 'security', 'game', 'financial', 'auth')),
    severity       text        not null default 'info' check (severity in ('info', 'warning', 'critical')),
    properties     jsonb       not null default '{}',
    giveaway_id    uuid        references public.giveaways(id) on delete set null,
    ip_address     text,
    user_agent     text,
    page_url       text,
    created_at     timestamptz not null default now()
);

comment on table public.fps_events is
    'FairPlay System event log: analytics funnel, game integrity and financial events. '
    'Written by API routes via service_role and by security definer functions. '
    'Read by the admin dashboard.';

create index if not exists fps_events_created_at_idx  on public.fps_events (created_at desc);
create index if not exists fps_events_event_name_idx  on public.fps_events (event_name);
create index if not exists fps_events_category_idx    on public.fps_events (category);
create index if not exists fps_events_severity_idx    on public.fps_events (severity)       where severity <> 'info';
create index if not exists fps_events_user_id_idx     on public.fps_events (user_id)        where user_id is not null;
create index if not exists fps_events_fingerprint_idx on public.fps_events (fingerprint_id) where fingerprint_id is not null;
create index if not exists fps_events_giveaway_id_idx on public.fps_events (giveaway_id)    where giveaway_id is not null;

alter table public.fps_events enable row level security;

-- Admin read access goes through is_admin(), not the hardcoded email the original
-- fps_events.sql used. Migration 1 tried to install this policy but skipped it because
-- the table did not exist yet, so it is created here instead.
drop policy if exists "Admins can read fps_events" on public.fps_events;
create policy "Admins can read fps_events" on public.fps_events
    for select to authenticated using (public.is_admin());

-- No insert policy: writes come from service_role (which bypasses RLS) and from
-- security definer functions (which run as the table owner). Clients never insert here
-- directly — /api/fps/track is the only ingestion point.

-- Realtime for the admin live feed. Guarded so re-running is safe.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'fps_events'
    ) then
        alter publication supabase_realtime add table public.fps_events;
    end if;
end $$;

commit;

select 'Phase 0 / 4.5 of 5 — fps_events created' as result;
