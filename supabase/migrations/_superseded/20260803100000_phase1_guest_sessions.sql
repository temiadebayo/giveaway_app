-- =============================================================================
-- PHASE 1 / 1 — GUEST SESSION TOKENS
--
-- Closes the gap Phase 0 deliberately left open.
--
-- THE ATTACK
--   Guests are identified by a device fingerprint hash. That hash was:
--     * stored on guest_participants.fingerprint_id, readable by anon
--     * projected into the combined_leaderboard view, readable by anon
--     * copied onto giveaways.winner_fingerprint_id when a guest won, readable by anon
--   and link_guest_to_user(p_fingerprint_id) linked every guest row matching whatever
--   fingerprint string the caller passed in.
--
--   So: watch a giveaway, read the winning guest's fingerprint off the leaderboard,
--   sign up, call link_guest_to_user with it, and inherit their win — including
--   giveaways.winner_id, which is what claim_prize() checks. The real winner, who has
--   not signed up yet, simply loses the prize.
--
-- THE FIX
--   A fingerprint is an *identifier*, not a *credential*. It is observable by design,
--   so it can never be the thing that authorises a claim.
--
--   Guest joins now mint a random 256-bit session token server-side. Only its SHA-256
--   hash is stored; the raw token is returned exactly once, to the joining client, and
--   lives in that browser's localStorage. Claiming requires presenting the token.
--
--   Fingerprints stay — they remain useful for fraud correlation — but they are demoted
--   to what they always were: a signal, not a key. They are no longer exposed to clients.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Sessions
-- -----------------------------------------------------------------------------
create table if not exists public.guest_sessions (
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
    'One row per guest device. token_hash is sha256 of a token that exists in plaintext '
    'only in the issuing browser. Never expose token_hash or fingerprint_id to clients.';

create index if not exists guest_sessions_fingerprint_idx on public.guest_sessions (fingerprint_id);
create index if not exists guest_sessions_linked_user_idx on public.guest_sessions (linked_user_id);

alter table public.guest_sessions enable row level security;
-- No policy: clients never read this table. Access is via security definer functions
-- and service_role only.

alter table public.guest_participants
    add column if not exists guest_session_id uuid references public.guest_sessions(id) on delete set null;

create index if not exists guest_participants_session_idx on public.guest_participants (guest_session_id);

-- is_winner was never created by guest_participation_schema.sql, even though several
-- code paths already read it:
--   * the guest-join cooldown check queried .eq('is_winner', true) on this table, so the
--     "prevent previous winners" rule has never actually applied to guests
--   * complete_giveaway needs somewhere to record a guest win now that a guest winner is
--     identified by session rather than by fingerprint
-- Backfilled below from the existing winner_fingerprint_id before that column is dropped.
alter table public.guest_participants
    add column if not exists is_winner boolean not null default false;

create index if not exists guest_participants_winner_idx
    on public.guest_participants (giveaway_id) where is_winner;

alter table public.giveaways
    add column if not exists winner_guest_session_id uuid references public.guest_sessions(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. Backfill existing guests
--
-- Historic guest rows predate tokens, and a token cannot be issued retroactively —
-- the browser that would need to hold it never received one. Each existing fingerprint
-- gets a session whose token_hash is random and therefore unmatchable by anyone,
-- including us. That is the correct default: unclaimable rather than claimable-by-anyone.
--
-- The notice at the end reports how many unclaimed guest wins are affected. Those need
-- manual verification before payout — see the query in
-- supabase/audits/phase0_exposure_audit.sql section 9.
-- -----------------------------------------------------------------------------
do $$
declare
    v_sessions integer := 0;
    v_orphan_wins integer := 0;
begin
    with distinct_fp as (
        select distinct fingerprint_id
        from public.guest_participants
        where fingerprint_id is not null
          and guest_session_id is null
    ),
    created as (
        insert into public.guest_sessions (token_hash, fingerprint_id, created_at)
        select
            -- Unmatchable by construction: nobody holds a preimage.
            encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'utf8')), 'hex'),
            d.fingerprint_id,
            now()
        from distinct_fp d
        returning id, fingerprint_id
    )
    update public.guest_participants gp
    set guest_session_id = c.id
    from created c
    where gp.fingerprint_id = c.fingerprint_id
      and gp.guest_session_id is null;

    get diagnostics v_sessions = row_count;

    -- Carry existing guest winners across to the new column, and set the is_winner flag
    -- that the table never had. Both read winner_fingerprint_id, so this must happen
    -- before that column is dropped further down.
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'giveaways'
          and column_name = 'winner_fingerprint_id'
    ) then
        update public.giveaways g
        set winner_guest_session_id = gp.guest_session_id
        from public.guest_participants gp
        where gp.giveaway_id = g.id
          and g.winner_guest_session_id is null
          and g.winner_id is null
          and gp.guest_session_id is not null
          and gp.fingerprint_id is not distinct from g.winner_fingerprint_id
          and g.winner_fingerprint_id is not null;

        update public.guest_participants gp
        set is_winner = true
        from public.giveaways g
        where g.id = gp.giveaway_id
          and g.winner_fingerprint_id is not null
          and gp.fingerprint_id is not distinct from g.winner_fingerprint_id
          and gp.is_winner = false;
    end if;

    select count(*) into v_orphan_wins
    from public.giveaways
    where winner_guest_session_id is not null
      and winner_id is null
      and prize_claimed_at is null;

    raise notice 'Backfilled % guest participation row(s) into sessions', v_sessions;
    raise notice 'Unclaimed pre-existing guest wins needing manual review: %', v_orphan_wins;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Stop exposing the fingerprint
--
-- winner_fingerprint_id is dropped outright rather than nulled: leaving a harvestable
-- column in place and merely stopping new writes preserves the existing exposure.
-- winner_guest_session_id replaces it, and a session id confers no claim power on its
-- own — only the token does.
-- -----------------------------------------------------------------------------
alter table public.giveaways drop column if exists winner_fingerprint_id;

-- guest_participants.fingerprint_id stays for fraud correlation, but is now
-- column-revoked from clients along with linked_user_id.
revoke select on public.guest_participants from anon, authenticated;

grant select (
    id,
    giveaway_id,
    guest_session_id,
    guest_name,
    score,
    taps,
    best_streak,
    joined_at,
    completed_at,
    is_winner
) on public.guest_participants to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Leaderboard view — session id in place of fingerprint
--
-- Dropped and recreated rather than replaced: `create or replace view` can only change
-- the body, not the shape. This changes both the name and the type of a column
-- (fingerprint_id text -> guest_session_id uuid), which CREATE OR REPLACE rejects with
-- 42P16.
--
-- Plain DROP, not DROP ... CASCADE — if something unexpected depends on this view we
-- want the migration to stop and say so, not to quietly delete it. complete_giveaway()
-- reads the view inside its body, which is not a catalogue dependency, so it is
-- unaffected. Grants are reapplied below, since dropping the view drops them too.
-- -----------------------------------------------------------------------------
drop view if exists public.combined_leaderboard;

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
    gp.id                as participation_id,
    'guest'              as participant_type,
    gp.linked_user_id    as user_id,
    gp.guest_session_id,
    coalesce(gp.guest_name, 'Guest') as username,
    gp.guest_name        as display_name,
    null::text           as avatar_url,
    'bronze'::text       as trust_tier,
    gp.score,
    gp.taps,
    gp.best_streak,
    gp.joined_at,
    gp.completed_at,
    coalesce(gp.is_winner, false)
from public.guest_participants gp
where gp.linked_user_id is null;

grant select on public.combined_leaderboard to anon, authenticated;

-- The guest fallback name used to be 'Guest ' || substring(fingerprint_id, 1, 6),
-- which leaked the first six characters of the fingerprint into a public label.

-- -----------------------------------------------------------------------------
-- 5. Mint a session (service_role only — called by the guest-join API route)
--
-- Returns the raw token ONCE. It is never retrievable again; only its hash is stored.
-- -----------------------------------------------------------------------------
create or replace function public.create_guest_session(
    p_fingerprint text default null,
    p_user_agent  text default null,
    p_ip_address  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_token text;
    v_id    uuid;
begin
    -- 244 bits of entropy from two v4 UUIDs; avoids a pgcrypto dependency for
    -- gen_random_bytes, while sha256() is core Postgres.
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.guest_sessions (token_hash, fingerprint_id, user_agent, ip_address)
    values (
        encode(sha256(convert_to(v_token, 'utf8')), 'hex'),
        p_fingerprint,
        left(coalesce(p_user_agent, ''), 500),
        p_ip_address
    )
    returning id into v_id;

    return jsonb_build_object('session_id', v_id, 'token', v_token);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Resolve a token to a session (service_role only)
-- -----------------------------------------------------------------------------
create or replace function public.resolve_guest_session(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
begin
    if coalesce(trim(p_token), '') = '' then
        return null;
    end if;

    -- convert_to(text,'utf8') gives the bytea to hash; encode(...,'hex') is the stored
    -- representation. Both sides of this comparison must use hex — 'utf8' is not a
    -- valid encode() format and would error at runtime.
    update public.guest_sessions
    set last_seen_at = now()
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    returning id into v_id;

    return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Claim a guest session into a user account
--
-- Replaces link_guest_to_user(p_fingerprint_id), which authorised on an observable
-- identifier. That function is dropped so no caller can fall back to it.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
    for r in
        select oid::regprocedure as sig from pg_proc
        where pronamespace = 'public'::regnamespace and proname = 'link_guest_to_user'
    loop
        execute format('drop function if exists %s', r.sig);
    end loop;
end $$;

create or replace function public.claim_guest_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid          uuid := auth.uid();
    v_session      record;
    v_linked_count integer := 0;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;
    if coalesce(trim(p_token), '') = '' then
        return jsonb_build_object('success', false, 'error', 'Missing session token');
    end if;

    select * into v_session
    from public.guest_sessions
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    for update;

    if v_session is null then
        return jsonb_build_object('success', false, 'error', 'Invalid session token');
    end if;

    -- A session belongs to one account, permanently. Without this, two accounts could
    -- take turns claiming the same guest history.
    if v_session.linked_user_id is not null and v_session.linked_user_id <> v_uid then
        return jsonb_build_object('success', false, 'error', 'This guest session is already claimed');
    end if;

    update public.guest_sessions
    set linked_user_id = v_uid, linked_at = coalesce(linked_at, now()), last_seen_at = now()
    where id = v_session.id;

    update public.guest_participants
    set linked_user_id = v_uid, linked_at = now()
    where guest_session_id = v_session.id and linked_user_id is null;

    get diagnostics v_linked_count = row_count;

    -- Carry scores into the authenticated participant table for still-running events.
    insert into public.giveaway_participants (
        giveaway_id, user_id, score, taps, best_streak, joined_at, completed_at
    )
    select gp.giveaway_id, v_uid, gp.score, gp.taps, gp.best_streak, gp.joined_at, gp.completed_at
    from public.guest_participants gp
    join public.giveaways g on g.id = gp.giveaway_id
    where gp.guest_session_id = v_session.id
      and g.status in ('live', 'scheduled')
    on conflict (giveaway_id, user_id) do update
    set score        = excluded.score,
        taps         = excluded.taps,
        best_streak  = excluded.best_streak,
        completed_at = excluded.completed_at;

    -- Award any wins this session earned while unauthenticated.
    update public.giveaways
    set winner_id = v_uid, updated_at = now()
    where winner_guest_session_id = v_session.id
      and winner_id is null;

    return jsonb_build_object('success', true, 'linked_count', v_linked_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. complete_giveaway — record the winning session, not the fingerprint
-- -----------------------------------------------------------------------------
create or replace function public.complete_giveaway(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_giveaway          record;
    v_escrow            record;
    v_winner            record;
    v_participant_count integer;
begin
    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;

    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;
    if v_giveaway.status = 'ended' then
        return jsonb_build_object('success', false, 'error', 'Giveaway already ended');
    end if;
    if v_giveaway.status = 'cancelled' then
        return jsonb_build_object('success', false, 'error', 'Giveaway was cancelled');
    end if;

    if v_giveaway.host_id <> auth.uid()
       and not public.is_admin()
       and (v_giveaway.ends_at is null or v_giveaway.ends_at > now())
    then
        return jsonb_build_object('success', false, 'error', 'This giveaway has not finished yet');
    end if;

    select * into v_escrow
    from public.escrow
    where giveaway_id = p_giveaway_id and status = 'held'
    for update;

    if v_escrow is null then
        return jsonb_build_object('success', false, 'error', 'Escrow funds not found');
    end if;

    select count(*) into v_participant_count
    from public.combined_leaderboard
    where giveaway_id = p_giveaway_id and completed_at is not null;

    if v_participant_count = 0 then
        update public.wallets
        set balance        = balance + v_escrow.amount,
            escrow_balance = greatest(0, escrow_balance - v_escrow.amount),
            updated_at     = now()
        where user_id = v_giveaway.host_id;

        update public.escrow set status = 'refunded', released_at = now() where id = v_escrow.id;

        update public.giveaways
        set status = 'cancelled', ends_at = now(), updated_at = now()
        where id = p_giveaway_id;

        insert into public.wallet_transactions (
            wallet_id, user_id, type, amount, fee, net_amount,
            balance_before, balance_after, status, reference_type, reference_id, description
        )
        select w.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
               w.balance - v_escrow.amount, w.balance, 'completed', 'giveaway', p_giveaway_id,
               'Giveaway ended with no participants - escrow refunded'
        from public.wallets w where w.user_id = v_giveaway.host_id;

        return jsonb_build_object('success', true, 'status', 'cancelled',
            'reason', 'No participants', 'refunded', v_escrow.amount);
    end if;

    select * into v_winner
    from public.combined_leaderboard
    where giveaway_id = p_giveaway_id and completed_at is not null
    order by score desc, completed_at asc
    limit 1;

    update public.giveaways
    set status                  = 'ended',
        winner_id               = v_winner.user_id,
        winner_guest_session_id = v_winner.guest_session_id,
        winning_score           = v_winner.score,
        ends_at                 = least(coalesce(ends_at, now()), now()),
        updated_at              = now()
    where id = p_giveaway_id;

    if v_winner.user_id is not null then
        update public.giveaway_participants
        set is_winner = true
        where giveaway_id = p_giveaway_id and user_id = v_winner.user_id;

        update public.profiles
        set total_wins = total_wins + 1, updated_at = now()
        where id = v_winner.user_id;
    else
        update public.guest_participants
        set is_winner = true
        where id = v_winner.participation_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'status', 'ended',
        'winner_id', v_winner.user_id,
        'winner_guest_session_id', v_winner.guest_session_id,
        'winner_username', v_winner.username,
        'winning_score', v_winner.score,
        'prize_amount', v_escrow.amount,
        'is_guest', v_winner.participant_type = 'guest'
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.create_guest_session(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_guest_session(text)            from public, anon, authenticated;
revoke all on function public.claim_guest_session(text)              from public, anon, authenticated;
revoke all on function public.complete_giveaway(uuid)                from public;

grant execute on function public.create_guest_session(text, text, text) to service_role;
grant execute on function public.resolve_guest_session(text)            to service_role;
grant execute on function public.claim_guest_session(text)              to authenticated;
grant execute on function public.complete_giveaway(uuid)                to anon, authenticated;

revoke all on public.guest_sessions from anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'Phase 1 / 1 — guest session tokens live. Fingerprints no longer confer claim power.' as result;
