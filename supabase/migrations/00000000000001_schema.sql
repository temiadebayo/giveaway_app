-- =============================================================================
-- 01 — SCHEMA: tables, indexes, views
--
-- The complete data model. No functions, no policies, no grants — those are files 02
-- and 03, so that each concern can be read on its own.
--
-- Notes on choices that differ from the pre-reset database:
--   * gen_random_uuid() everywhere instead of uuid_generate_v4(). It is core Postgres
--     (13+), so the schema no longer depends on the uuid-ossp extension living in public.
--   * profiles.is_host is gone. It was an authorization flag that users could set on
--     themselves; public.admin_users replaces it.
--   * giveaways.winner_fingerprint_id is gone. A fingerprint is observable, so it could
--     never be the thing that authorises a prize claim; winner_guest_session_id replaces it.
--   * guest_participants.is_winner exists. Application code has always queried it; the
--     column was simply never created, so the guest previous-winner cooldown silently
--     never fired.
--   * Money columns are numeric(12,2) consistently. profiles.total_winnings was
--     numeric(10,2) while wallets used numeric(12,2), which capped it two orders of
--     magnitude lower than the wallet it mirrors.
-- =============================================================================

begin;

-- =============================================================================
-- IDENTITY
-- =============================================================================

create table public.profiles (
    id                       uuid primary key references auth.users(id) on delete cascade,
    username                 text unique,
    display_name             text,
    avatar_url               text,
    bio                      text,
    email                    text,
    phone                    text,
    phone_verified           boolean not null default false,
    id_verified              boolean not null default false,
    trust_score              integer not null default 20 check (trust_score between 0 and 100),
    trust_tier               text    not null default 'bronze' check (trust_tier in ('bronze','silver','gold','diamond')),
    total_wins               integer not null default 0,
    total_winnings           numeric(12,2) not null default 0,
    withdrawal_limit         numeric(12,2) not null default 10000,
    bank_name                text,
    account_name             text,
    account_number           text,
    notification_preferences jsonb not null default '{
        "winning_alerts": true,
        "new_giveaway_tier": true,
        "host_live": true,
        "trust_updates": false,
        "email_digest": false
    }'::jsonb,
    privacy_settings         jsonb not null default '{
        "hide_wins": false,
        "anonymous_leaderboard": false,
        "public_profile": true
    }'::jsonb,
    accepted_tos             boolean not null default false,
    is_banned                boolean not null default false,
    ban_reason               text,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

comment on column public.profiles.trust_score is
    'Server-owned. Written only by recalculate_trust_score() and the KYC approval RPC — '
    'never granted to the client.';

create index profiles_trust_tier_idx  on public.profiles (trust_tier);
create index profiles_trust_score_idx on public.profiles (trust_score);
create index profiles_username_idx    on public.profiles (lower(username));

-- Admin roster. The single source of truth for privilege.
create table public.admin_users (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    email      text not null,
    role       text not null default 'admin' check (role in ('admin','superadmin')),
    notes      text,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users(id)
);

comment on table public.admin_users is
    'Membership is changed by SQL / service_role only. Never expose a write path to this '
    'table — it is the root of all admin authorization.';

-- Append-only record of privileged actions.
create table public.admin_audit_log (
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

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx      on public.admin_audit_log (actor_id);
create index admin_audit_log_target_idx     on public.admin_audit_log (target_type, target_id);

-- =============================================================================
-- DEVICE / FRAUD SIGNALS
-- =============================================================================

create table public.device_fingerprints (
    id               uuid primary key default gen_random_uuid(),
    fingerprint_hash text unique not null,
    canvas_hash      text,
    webgl_info       jsonb,
    audio_hash       text,
    screen_info      text,
    confidence       integer not null default 0 check (confidence between 0 and 100),
    times_seen       integer not null default 1,
    is_flagged       boolean not null default false,
    flag_reason      text,
    first_seen_at    timestamptz not null default now(),
    last_seen_at     timestamptz not null default now(),
    created_at       timestamptz not null default now()
);

comment on column public.device_fingerprints.is_flagged is
    'Moderation state. Never grant this column to clients — a user must not be able to '
    'read, let alone clear, whether their device has been flagged.';

create index device_fingerprints_hash_idx on public.device_fingerprints (fingerprint_hash);

create table public.user_devices (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references public.profiles(id) on delete cascade,
    fingerprint_id     uuid not null references public.device_fingerprints(id) on delete cascade,
    ip_address         inet,
    user_agent         text,
    is_primary         boolean not null default false,
    trust_contribution integer not null default 0,
    created_at         timestamptz not null default now(),
    last_used_at       timestamptz not null default now(),
    unique (user_id, fingerprint_id)
);

create index user_devices_user_idx        on public.user_devices (user_id);
create index user_devices_fingerprint_idx on public.user_devices (fingerprint_id);

create table public.trust_events (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles(id) on delete cascade,
    event_type   text not null,
    score_before integer not null,
    score_after  integer not null,
    score_change integer not null,
    reason       text,
    metadata     jsonb,
    created_at   timestamptz not null default now()
);

create index trust_events_user_idx on public.trust_events (user_id, created_at desc);

create table public.fraud_alerts (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references public.profiles(id) on delete cascade,
    device_id   uuid references public.device_fingerprints(id) on delete set null,
    alert_type  text not null,
    severity    text check (severity in ('low','medium','high','critical')),
    description text,
    evidence    jsonb,
    status      text not null default 'pending' check (status in ('pending','reviewing','resolved','false_positive')),
    reviewed_by uuid references public.profiles(id),
    created_at  timestamptz not null default now(),
    resolved_at timestamptz
);

create index fraud_alerts_status_idx on public.fraud_alerts (status, created_at desc);

-- =============================================================================
-- WALLET / MONEY
--
-- Every write to these tables goes through a security definer RPC that locks the row.
-- No client role is ever granted INSERT/UPDATE/DELETE here.
-- =============================================================================

create table public.wallets (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null unique references public.profiles(id) on delete cascade,
    balance         numeric(12,2) not null default 0 check (balance >= 0),
    escrow_balance  numeric(12,2) not null default 0 check (escrow_balance >= 0),
    total_earned    numeric(12,2) not null default 0,
    total_withdrawn numeric(12,2) not null default 0,
    total_deposited numeric(12,2) not null default 0,
    currency        text not null default 'NGN',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on column public.wallets.escrow_balance is
    'Holds host prize escrow AND unconfirmed deposits. Overloaded — split when a real '
    'payment provider replaces manual bank transfers.';

create table public.wallet_transactions (
    id             uuid primary key default gen_random_uuid(),
    wallet_id      uuid not null references public.wallets(id) on delete cascade,
    user_id        uuid not null references public.profiles(id) on delete cascade,
    type           text not null check (type in (
                       'deposit','withdrawal','withdrawal_fee','prize_escrow',
                       'prize_release','prize_refund','entry_fee','platform_fee')),
    amount         numeric(12,2) not null,
    fee            numeric(12,2) not null default 0,
    net_amount     numeric(12,2) not null,
    balance_before numeric(12,2) not null,
    balance_after  numeric(12,2) not null,
    status         text not null default 'completed' check (status in ('pending','completed','failed','cancelled')),
    reference_type text,
    reference_id   uuid,
    description    text,
    metadata       jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index wallet_transactions_wallet_idx  on public.wallet_transactions (wallet_id);
create index wallet_transactions_user_idx    on public.wallet_transactions (user_id, created_at desc);
create index wallet_transactions_type_idx    on public.wallet_transactions (type);
create index wallet_transactions_pending_idx on public.wallet_transactions (status) where status = 'pending';

create table public.withdrawal_requests (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.profiles(id) on delete cascade,
    wallet_id      uuid not null references public.wallets(id) on delete cascade,
    amount         numeric(12,2) not null check (amount > 0),
    fee            numeric(12,2) not null,
    net_amount     numeric(12,2) not null,
    fee_percentage numeric(5,2) not null,
    status         text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
    payout_method  text,
    payout_details jsonb,
    hold_until     timestamptz,
    processed_at   timestamptz,
    created_at     timestamptz not null default now()
);

create index withdrawal_requests_user_idx    on public.withdrawal_requests (user_id, created_at desc);
create index withdrawal_requests_pending_idx on public.withdrawal_requests (status) where status in ('pending','processing');

-- =============================================================================
-- GIVEAWAYS
-- =============================================================================

create table public.giveaways (
    id                             uuid primary key default gen_random_uuid(),
    host_id                        uuid not null references public.profiles(id) on delete cascade,
    title                          text not null,
    description                    text,
    prize_amount                   numeric(12,2) not null check (prize_amount > 0),
    prize_currency                 text not null default 'NGN',
    game_type                      text not null default 'tap' check (game_type in ('tap','quiz','spin')),
    game_duration_seconds          integer not null default 30 check (game_duration_seconds between 5 and 300),
    min_trust_tier                 text not null default 'bronze' check (min_trust_tier in ('bronze','silver','gold','diamond')),
    max_participants               integer check (max_participants is null or max_participants >= 1),
    entry_fee                      numeric(12,2) not null default 0,
    status                         text not null default 'draft' check (status in ('draft','scheduled','live','ended','cancelled')),
    number_of_winners              integer not null default 1 check (number_of_winners >= 1),
    prevent_previous_winners_hours integer not null default 0 check (prevent_previous_winners_hours >= 0),
    allow_sharing                  boolean not null default true,
    share_code                     text unique,
    scheduled_start_at             timestamptz,
    starts_at                      timestamptz,
    ends_at                        timestamptz,
    winner_id                      uuid references public.profiles(id),
    winner_guest_session_id        uuid,   -- FK added after guest_sessions exists
    winning_score                  integer,
    prize_claimed_at               timestamptz,
    created_at                     timestamptz not null default now(),
    updated_at                     timestamptz not null default now()
);

comment on column public.giveaways.number_of_winners is
    'Stored and configurable, but complete_giveaway() currently selects a single winner. '
    'Multi-winner payout needs escrow splitting — until then the create form should not '
    'offer the option.';

create index giveaways_status_idx     on public.giveaways (status);
create index giveaways_host_idx       on public.giveaways (host_id, created_at desc);
create index giveaways_live_idx       on public.giveaways (ends_at) where status = 'live';

create table public.giveaway_participants (
    id                    uuid primary key default gen_random_uuid(),
    giveaway_id           uuid not null references public.giveaways(id) on delete cascade,
    user_id               uuid not null references public.profiles(id) on delete cascade,
    device_fingerprint_id uuid references public.device_fingerprints(id) on delete set null,
    score                 integer not null default 0,
    taps                  integer not null default 0,
    best_streak           integer not null default 0,
    rank                  integer,
    is_winner             boolean not null default false,
    joined_at             timestamptz not null default now(),
    completed_at          timestamptz,
    unique (giveaway_id, user_id)
);

create index giveaway_participants_giveaway_idx on public.giveaway_participants (giveaway_id, score desc);
create index giveaway_participants_user_idx     on public.giveaway_participants (user_id);
create index giveaway_participants_winner_idx   on public.giveaway_participants (user_id) where is_winner;

-- =============================================================================
-- GUESTS
--
-- A guest is identified by a session, authenticated by a token whose hash is all the
-- database ever stores. The device fingerprint is kept as a fraud signal only — it is
-- observable, so it can never authorise anything.
-- =============================================================================

create table public.guest_sessions (
    id             uuid primary key default gen_random_uuid(),
    token_hash     text not null unique,
    fingerprint_id text,
    user_agent     text,
    ip_address     text,
    linked_user_id uuid references public.profiles(id) on delete set null,
    linked_at      timestamptz,
    created_at     timestamptz not null default now(),
    last_seen_at   timestamptz not null default now()
);

comment on table public.guest_sessions is
    'token_hash is sha256 of a token that exists in plaintext only in the issuing '
    'browser. Never expose token_hash or fingerprint_id to any client role.';

create index guest_sessions_fingerprint_idx on public.guest_sessions (fingerprint_id);
create index guest_sessions_linked_idx      on public.guest_sessions (linked_user_id);

alter table public.giveaways
    add constraint giveaways_winner_guest_session_fkey
    foreign key (winner_guest_session_id) references public.guest_sessions(id) on delete set null;

create table public.guest_participants (
    id               uuid primary key default gen_random_uuid(),
    giveaway_id      uuid not null references public.giveaways(id) on delete cascade,
    guest_session_id uuid references public.guest_sessions(id) on delete set null,
    fingerprint_id   text,
    guest_name       text,
    score            integer not null default 0,
    taps             integer not null default 0,
    best_streak      integer not null default 0,
    is_winner        boolean not null default false,
    joined_at        timestamptz not null default now(),
    completed_at     timestamptz,
    linked_user_id   uuid references public.profiles(id) on delete set null,
    linked_at        timestamptz,
    unique (giveaway_id, guest_session_id)
);

create index guest_participants_giveaway_idx on public.guest_participants (giveaway_id, score desc);
create index guest_participants_session_idx  on public.guest_participants (guest_session_id);
create index guest_participants_winner_idx   on public.guest_participants (giveaway_id) where is_winner;

-- =============================================================================
-- ESCROW
-- =============================================================================

create table public.escrow (
    id          uuid primary key default gen_random_uuid(),
    giveaway_id uuid not null unique references public.giveaways(id) on delete cascade,
    host_id     uuid not null references public.profiles(id) on delete cascade,
    amount      numeric(12,2) not null check (amount > 0),
    status      text not null default 'held' check (status in ('held','released','refunded')),
    released_to uuid references public.profiles(id),
    released_at timestamptz,
    created_at  timestamptz not null default now()
);

create index escrow_held_idx on public.escrow (giveaway_id) where status = 'held';

-- =============================================================================
-- KYC
-- =============================================================================

create table public.kyc_requests (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.profiles(id) on delete cascade,
    id_card_url      text not null,
    selfie_url       text not null,
    status           text not null default 'pending' check (status in ('pending','approved','rejected')),
    rejection_reason text,
    reviewed_at      timestamptz,
    reviewed_by      uuid references auth.users(id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- One live request per user; rejected ones may be resubmitted.
create unique index kyc_requests_active_idx on public.kyc_requests (user_id)
    where status in ('pending','approved');

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

create table public.notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles(id) on delete cascade,
    type       text not null check (type in ('win','kyc','trust','giveaway_live','deposit','system')),
    title      text not null,
    message    text not null,
    link       text,
    payload    jsonb not null default '{}',
    is_read    boolean not null default false,
    created_at timestamptz not null default now()
);

create index notifications_unread_idx  on public.notifications (user_id, is_read) where not is_read;
create index notifications_created_idx on public.notifications (user_id, created_at desc);

-- =============================================================================
-- FAIRPLAY EVENT LOG
-- =============================================================================

create table public.fps_events (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references public.profiles(id) on delete set null,
    fingerprint_id text,
    event_name     text not null,
    category       text not null check (category in ('analytics','security','game','financial','auth')),
    severity       text not null default 'info' check (severity in ('info','warning','critical')),
    properties     jsonb not null default '{}',
    giveaway_id    uuid references public.giveaways(id) on delete set null,
    ip_address     text,
    user_agent     text,
    page_url       text,
    created_at     timestamptz not null default now()
);

create index fps_events_created_idx     on public.fps_events (created_at desc);
create index fps_events_name_idx        on public.fps_events (event_name);
create index fps_events_category_idx    on public.fps_events (category);
create index fps_events_severity_idx    on public.fps_events (severity) where severity <> 'info';
create index fps_events_user_idx        on public.fps_events (user_id)     where user_id is not null;
create index fps_events_giveaway_idx    on public.fps_events (giveaway_id) where giveaway_id is not null;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- The public shape of a user. Everything else on profiles is private.
create view public.public_profiles as
select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.trust_tier,
    p.total_wins,
    p.created_at
from public.profiles p;

-- Authenticated players and unlinked guests in one ranking.
-- Exposes guest_session_id, never fingerprint_id: a session id confers no claim power,
-- a fingerprint used to.
create view public.combined_leaderboard as
select
    p.giveaway_id,
    p.id            as participation_id,
    'user'          as participant_type,
    p.user_id,
    null::uuid      as guest_session_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.trust_tier,
    p.score,
    p.taps,
    p.best_streak,
    p.joined_at,
    p.completed_at,
    p.is_winner
from public.giveaway_participants p
join public.profiles pr on pr.id = p.user_id

union all

select
    gp.giveaway_id,
    gp.id                            as participation_id,
    'guest'                          as participant_type,
    gp.linked_user_id                as user_id,
    gp.guest_session_id,
    coalesce(gp.guest_name, 'Guest') as username,
    gp.guest_name                    as display_name,
    null::text                       as avatar_url,
    'bronze'::text                   as trust_tier,
    gp.score,
    gp.taps,
    gp.best_streak,
    gp.joined_at,
    gp.completed_at,
    gp.is_winner
from public.guest_participants gp
where gp.linked_user_id is null;

commit;

select 'Schema created. Run 00000000000002_functions.sql next.' as result;
