-- FairPlay System: Unified Event Log
-- Run this in Supabase SQL Editor

create table if not exists fps_events (
    id             uuid          default gen_random_uuid() primary key,
    user_id        uuid          references profiles(id) on delete set null,
    fingerprint_id text,
    event_name     text          not null,
    category       text          not null check (category in ('analytics', 'security', 'game', 'financial', 'auth')),
    severity       text          not null default 'info' check (severity in ('info', 'warning', 'critical')),
    properties     jsonb         not null default '{}',
    giveaway_id    uuid          references giveaways(id) on delete set null,
    ip_address     text,
    user_agent     text,
    page_url       text,
    created_at     timestamptz   not null default now()
);

-- Indexes for dashboard query performance
create index if not exists fps_events_created_at_idx    on fps_events(created_at desc);
create index if not exists fps_events_event_name_idx    on fps_events(event_name);
create index if not exists fps_events_category_idx      on fps_events(category);
create index if not exists fps_events_severity_idx      on fps_events(severity) where severity != 'info';
create index if not exists fps_events_user_id_idx       on fps_events(user_id)        where user_id is not null;
create index if not exists fps_events_fingerprint_idx   on fps_events(fingerprint_id) where fingerprint_id is not null;
create index if not exists fps_events_giveaway_id_idx   on fps_events(giveaway_id)    where giveaway_id is not null;

-- Enable Realtime so the admin dashboard can subscribe
alter publication supabase_realtime add table fps_events;

-- RLS: service role bypasses (inserts from API routes)
-- Admin users can SELECT for the dashboard
alter table fps_events enable row level security;

create policy "Admins can read fps_events"
    on fps_events for select
    to authenticated
    using (auth.email() = 'temiadebayo1@gmail.com');
-- To add more admins: auth.email() in ('admin1@...', 'admin2@...')
