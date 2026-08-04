-- =============================================================================
-- PHASE 0 / 3 of 5 — AUTHORIZATION ON PRIVILEGED FUNCTIONS
--
-- Problems this fixes:
--   P0-3  Every security definer function was executable by PUBLIC (Postgres default)
--         and several contained no authorization check at all:
--           approve_deposit()     -> approve your own deposit. Free money, no bank transfer.
--           approve_withdrawal()  -> no admin check
--           reject_withdrawal()   -> no admin check
--           complete_giveaway()   -> end anyone's giveaway, at any moment
--   P0-5  request_withdrawal() took the fee percentage and hold period as ARGUMENTS
--         from the browser. {p_fee_percentage: 0, p_hold_hours: 0} => no fee, no hold.
--   P0-9  complete_giveaway() was called from a client setInterval, so whoever had a
--         tab open decided when a giveaway ended.
--
-- Also fixed throughout:
--   * every function pins search_path (none of the legacy ones did — a caller who
--     controls their search_path could otherwise shadow the tables these functions read)
--   * every money path takes a row lock before it reads-then-writes
--   * one canonical tier ladder replaces the three conflicting ones that existed in
--     schema.sql, phone_verification_trust.sql and trust-engine.ts
-- =============================================================================

begin;

-- =============================================================================
-- SECTION A — canonical tier model
--
-- These three definitions previously disagreed:
--   schema.sql:166               thresholds 86/61/31, limits 10000/2000/500/50
--   phone_verification_trust.sql thresholds 80/60/40, limits 500000/100000/50000/10000
--   src/lib/trust-engine.ts      thresholds 86/61/31, limits 10000/2000/500/50
--
-- Canonicalised on the trust-engine.ts thresholds (that is what the UI renders) and
-- the NGN limit ladder (the 50/500/2000/10000 ladder reads as leftover USD figures;
-- a ₦50 withdrawal limit is not meaningful). Cooldowns come from kyc_preparation.md.
--
-- >> These are the numbers to confirm before go-live. Change them here only; every
-- >> other site now reads from these functions. <<
-- =============================================================================

create or replace function public.tier_for_score(p_score integer)
returns text
language sql
immutable
as $$
    select case
        when p_score >= 86 then 'diamond'
        when p_score >= 61 then 'gold'
        when p_score >= 31 then 'silver'
        else 'bronze'
    end;
$$;

create or replace function public.tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
    select case p_tier
        when 'diamond' then 4
        when 'gold'    then 3
        when 'silver'  then 2
        else 1
    end;
$$;

create or replace function public.withdrawal_limit_for_tier(p_tier text)
returns numeric
language sql
immutable
as $$
    select case p_tier
        when 'diamond' then 500000::numeric
        when 'gold'    then 100000::numeric
        when 'silver'  then  50000::numeric
        else                 10000::numeric
    end;
$$;

create or replace function public.withdrawal_cooldown_hours(p_tier text)
returns integer
language sql
immutable
as $$
    select case p_tier
        when 'diamond' then 6
        when 'gold'    then 24
        else 48
    end;
$$;

-- Fee schedule lives in ONE place now.
-- Previously: src/lib/wallet-service.ts declared 5% withdrawal + an unused 7.5% VAT and
-- 3% commission, /fees and the wallet UI quoted 5%, and the SQL function defaulted to 3%.
-- Users were being shown a number the database did not charge.
create or replace function public.get_fee_schedule()
returns jsonb
language sql
stable
as $$
    select jsonb_build_object(
        'deposit_fee_percent',     0.0,
        'withdrawal_fee_percent',  5.0,
        'max_deposit',         5000000.0,
        'max_withdrawal',       500000.0,
        'currency',                'NGN'
    );
$$;

comment on function public.get_fee_schedule() is
    'Authoritative fee schedule. The UI reads this instead of hardcoding percentages. '
    'deposit_fee_percent is 0 because no deposit fee is actually charged anywhere in the '
    'current deposit path — the 5% shown in the UI was never implemented. Set it here and '
    'implement it in request_deposit() if it is meant to be charged.';

-- Keep the trust-tier trigger consistent with the ladder above.
create or replace function public.update_trust_tier()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    new.trust_tier       := public.tier_for_score(new.trust_score);
    new.withdrawal_limit := public.withdrawal_limit_for_tier(new.trust_tier);
    new.updated_at       := now();
    return new;
end;
$$;

-- =============================================================================
-- SECTION B — drop legacy duplicates and stale overloads
--
-- We cannot know which variant of these is currently deployed, so every signature
-- is dropped by catalogue lookup before the canonical version is created.
-- =============================================================================

do $$
declare
    r record;
    fn text;
begin
    foreach fn in array array[
        'request_withdrawal',      -- had 3- and 4-arg variants with client-supplied fee/hold
        'finalize_giveaway',       -- legacy duplicate of complete_giveaway; removed entirely
        'complete_giveaway',
        'approve_deposit',
        'reject_deposit',
        'approve_withdrawal',
        'reject_withdrawal',
        'claim_prize'
    ]
    loop
        for r in
            select oid::regprocedure as sig
            from pg_proc
            where pronamespace = 'public'::regnamespace and proname = fn
        loop
            execute format('drop function if exists %s cascade', r.sig);
        end loop;
    end loop;
end $$;

-- =============================================================================
-- SECTION C — withdrawals
-- =============================================================================

-- Fee percentage and hold hours are now DERIVED, not accepted.
create or replace function public.request_withdrawal(
    p_amount          numeric,
    p_payout_details  jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid              uuid := auth.uid();
    v_wallet           record;
    v_profile          record;
    v_fees             jsonb := public.get_fee_schedule();
    v_fee_percentage   numeric;
    v_tier_limit       numeric;
    v_cooldown_hours   integer;
    v_hold_hours       integer;
    v_last_withdrawal  timestamptz;
    v_hours_since      numeric;
    v_fee              numeric;
    v_net              numeric;
    v_withdrawal_id    uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    if p_amount is null or p_amount <= 0 then
        return jsonb_build_object('success', false, 'error', 'Invalid amount');
    end if;

    select * into v_profile from public.profiles where id = v_uid;
    if v_profile is null then
        return jsonb_build_object('success', false, 'error', 'Profile not found');
    end if;

    if coalesce(v_profile.is_banned, false) then
        return jsonb_build_object('success', false, 'error', 'Account is suspended');
    end if;

    -- Lock the wallet row for the duration of the transaction so two concurrent
    -- withdrawal requests cannot both pass the balance check.
    select * into v_wallet from public.wallets where user_id = v_uid for update;
    if v_wallet is null then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    v_fee_percentage := (v_fees ->> 'withdrawal_fee_percent')::numeric;
    v_tier_limit     := public.withdrawal_limit_for_tier(v_profile.trust_tier);
    v_cooldown_hours := public.withdrawal_cooldown_hours(v_profile.trust_tier);
    v_hold_hours     := v_cooldown_hours;

    if p_amount > (v_fees ->> 'max_withdrawal')::numeric then
        return jsonb_build_object('success', false,
            'error', 'Withdrawal exceeds the platform maximum of ₦' || (v_fees ->> 'max_withdrawal'));
    end if;

    if p_amount > v_tier_limit then
        return jsonb_build_object('success', false,
            'error', 'Withdrawal exceeds your ' || v_profile.trust_tier ||
                     ' tier limit of ₦' || v_tier_limit || '. Verify your identity to raise it.');
    end if;

    if v_wallet.balance < p_amount then
        return jsonb_build_object('success', false, 'error', 'Insufficient balance');
    end if;

    select created_at into v_last_withdrawal
    from public.wallet_transactions
    where user_id = v_uid and type = 'withdrawal' and status in ('completed', 'pending')
    order by created_at desc
    limit 1;

    if v_last_withdrawal is not null then
        v_hours_since := extract(epoch from (now() - v_last_withdrawal)) / 3600;
        if v_hours_since < v_cooldown_hours then
            return jsonb_build_object('success', false,
                'error', 'Withdrawal cooldown active. Please wait ' ||
                         ceil(v_cooldown_hours - v_hours_since) ||
                         ' more hours (' || v_profile.trust_tier || ' tier).');
        end if;
    end if;

    v_fee := round(p_amount * (v_fee_percentage / 100), 2);
    v_net := p_amount - v_fee;

    update public.wallets
    set balance = balance - p_amount, updated_at = now()
    where id = v_wallet.id;

    insert into public.withdrawal_requests (
        user_id, wallet_id, amount, fee, net_amount, fee_percentage,
        payout_details, hold_until, status
    )
    values (
        v_uid, v_wallet.id, p_amount, v_fee, v_net, v_fee_percentage,
        p_payout_details, now() + (v_hold_hours || ' hours')::interval, 'pending'
    )
    returning id into v_withdrawal_id;

    insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, status, reference_type, reference_id, description
    )
    values (
        v_wallet.id, v_uid, 'withdrawal', p_amount, v_fee, v_net,
        v_wallet.balance, v_wallet.balance - p_amount, 'pending', 'withdrawal', v_withdrawal_id,
        'Withdrawal request - ' || v_hold_hours || 'h hold'
    );

    return jsonb_build_object(
        'success', true,
        'withdrawal_id', v_withdrawal_id,
        'amount', p_amount,
        'fee', v_fee,
        'fee_percentage', v_fee_percentage,
        'net_amount', v_net,
        'hold_until', now() + (v_hold_hours || ' hours')::interval
    );
end;
$$;

create or replace function public.approve_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_withdrawal record;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_withdrawal
    from public.withdrawal_requests
    where id = p_withdrawal_id and status in ('pending', 'processing')
    for update;

    if v_withdrawal is null then
        return jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
    end if;

    if v_withdrawal.hold_until > now() then
        return jsonb_build_object('success', false, 'error', 'Hold period has not expired yet');
    end if;

    update public.withdrawal_requests
    set status = 'completed', processed_at = now()
    where id = p_withdrawal_id;

    update public.wallets
    set total_withdrawn = total_withdrawn + v_withdrawal.amount, updated_at = now()
    where id = v_withdrawal.wallet_id;

    update public.wallet_transactions
    set status = 'completed', updated_at = now()
    where reference_id = p_withdrawal_id and type = 'withdrawal';

    perform public.log_admin_action(
        'withdrawal.approve', 'withdrawal_request', p_withdrawal_id, v_withdrawal.amount, null,
        jsonb_build_object('net_amount', v_withdrawal.net_amount, 'user_id', v_withdrawal.user_id)
    );

    return jsonb_build_object('success', true, 'net_amount', v_withdrawal.net_amount, 'fee', v_withdrawal.fee);
end;
$$;

create or replace function public.reject_withdrawal(p_withdrawal_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_withdrawal record;
    v_balance    numeric;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_withdrawal
    from public.withdrawal_requests
    where id = p_withdrawal_id and status in ('pending', 'processing')
    for update;

    if v_withdrawal is null then
        return jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
    end if;

    update public.withdrawal_requests
    set status = 'cancelled', processed_at = now()
    where id = p_withdrawal_id;

    update public.wallets
    set balance = balance + v_withdrawal.amount, updated_at = now()
    where id = v_withdrawal.wallet_id
    returning balance into v_balance;

    update public.wallet_transactions
    set status = 'cancelled',
        description = 'Withdrawal rejected - refunded',
        updated_at = now()
    where reference_id = p_withdrawal_id and type = 'withdrawal';

    insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, status, reference_type, reference_id, description
    )
    values (
        v_withdrawal.wallet_id, v_withdrawal.user_id, 'prize_refund',
        v_withdrawal.amount, 0, v_withdrawal.amount,
        v_balance - v_withdrawal.amount, v_balance, 'completed',
        'withdrawal_refund', p_withdrawal_id,
        coalesce('Withdrawal rejected: ' || p_reason, 'Withdrawal rejected - amount refunded')
    );

    perform public.log_admin_action(
        'withdrawal.reject', 'withdrawal_request', p_withdrawal_id, v_withdrawal.amount, p_reason,
        jsonb_build_object('user_id', v_withdrawal.user_id)
    );

    return jsonb_build_object('success', true, 'refunded', v_withdrawal.amount);
end;
$$;

-- =============================================================================
-- SECTION D — deposits
-- =============================================================================

create or replace function public.request_deposit(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid            uuid := auth.uid();
    v_wallet         record;
    v_fees           jsonb := public.get_fee_schedule();
    v_reference_code text;
    v_transaction_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    if p_amount is null or p_amount <= 0 then
        return jsonb_build_object('success', false, 'error', 'Invalid amount');
    end if;

    if p_amount > (v_fees ->> 'max_deposit')::numeric then
        return jsonb_build_object('success', false,
            'error', 'Deposit exceeds the maximum of ₦' || (v_fees ->> 'max_deposit'));
    end if;

    select * into v_wallet from public.wallets where user_id = v_uid for update;
    if v_wallet is null then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    v_reference_code := 'DEP-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));

    -- NOTE (Phase 1): escrow_balance is overloaded — it holds both host prize escrow and
    -- unconfirmed deposits. Split into a dedicated pending_deposit_balance when payments
    -- move to Paystack/Flutterwave.
    update public.wallets
    set escrow_balance = escrow_balance + p_amount, updated_at = now()
    where id = v_wallet.id;

    insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, status, reference_type, description, metadata
    )
    values (
        v_wallet.id, v_uid, 'deposit', p_amount, 0, p_amount,
        v_wallet.balance, v_wallet.balance, 'pending', 'manual_deposit',
        'Pending Deposit: ' || v_reference_code,
        jsonb_build_object('reference_code', v_reference_code)
    )
    returning id into v_transaction_id;

    return jsonb_build_object(
        'success', true,
        'reference_code', v_reference_code,
        'amount', p_amount,
        'transaction_id', v_transaction_id
    );
end;
$$;

create or replace function public.approve_deposit(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_tx     record;
    v_wallet record;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_tx
    from public.wallet_transactions
    where id = p_transaction_id and status = 'pending' and type = 'deposit'
    for update;

    if v_tx is null then
        return jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
    end if;

    select * into v_wallet from public.wallets where id = v_tx.wallet_id for update;
    if v_wallet is null then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    update public.wallets
    set escrow_balance  = greatest(0, escrow_balance - v_tx.amount),
        balance         = balance + v_tx.amount,
        total_deposited = total_deposited + v_tx.amount,
        updated_at      = now()
    where id = v_tx.wallet_id;

    update public.wallet_transactions
    set status         = 'completed',
        balance_before = v_wallet.balance,
        balance_after  = v_wallet.balance + v_tx.amount,
        updated_at     = now()
    where id = p_transaction_id;

    perform public.log_admin_action(
        'deposit.approve', 'wallet_transaction', p_transaction_id, v_tx.amount, null,
        jsonb_build_object('user_id', v_tx.user_id)
    );

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.reject_deposit(p_transaction_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_tx record;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_tx
    from public.wallet_transactions
    where id = p_transaction_id and status = 'pending' and type = 'deposit'
    for update;

    if v_tx is null then
        return jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
    end if;

    update public.wallets
    set escrow_balance = greatest(0, escrow_balance - v_tx.amount), updated_at = now()
    where id = v_tx.wallet_id;

    update public.wallet_transactions
    set status = 'cancelled', updated_at = now()
    where id = p_transaction_id;

    perform public.log_admin_action(
        'deposit.reject', 'wallet_transaction', p_transaction_id, v_tx.amount, p_reason,
        jsonb_build_object('user_id', v_tx.user_id)
    );

    return jsonb_build_object('success', true);
end;
$$;

-- =============================================================================
-- SECTION E — giveaway lifecycle
-- =============================================================================

create or replace function public.create_giveaway_with_escrow(
    p_title                          text,
    p_description                    text,
    p_prize_amount                   numeric,
    p_game_type                      text default 'tap',
    p_duration_seconds               integer default 30,
    p_min_trust_tier                 text default 'bronze',
    p_max_participants               integer default 1000,
    p_scheduled_start                timestamptz default null,
    p_allow_sharing                  boolean default true,
    p_number_of_winners              integer default 1,
    p_prevent_previous_winners_hours integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid         uuid := auth.uid();
    v_wallet      record;
    v_profile     record;
    v_giveaway_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    -- Input validation. These were previously unchecked, so a crafted RPC call could
    -- create a giveaway with a negative prize or a 10-hour game.
    if p_prize_amount is null or p_prize_amount <= 0 then
        return jsonb_build_object('success', false, 'error', 'Prize amount must be greater than zero');
    end if;
    if coalesce(trim(p_title), '') = '' then
        return jsonb_build_object('success', false, 'error', 'Title is required');
    end if;
    if p_duration_seconds not between 5 and 300 then
        return jsonb_build_object('success', false, 'error', 'Duration must be between 5 and 300 seconds');
    end if;
    if p_max_participants is not null and p_max_participants < 1 then
        return jsonb_build_object('success', false, 'error', 'Max participants must be at least 1');
    end if;
    if p_number_of_winners < 1 then
        return jsonb_build_object('success', false, 'error', 'Must have at least one winner');
    end if;
    if p_min_trust_tier not in ('bronze', 'silver', 'gold', 'diamond') then
        return jsonb_build_object('success', false, 'error', 'Invalid minimum trust tier');
    end if;

    select * into v_profile from public.profiles where id = v_uid;
    if coalesce(v_profile.is_banned, false) then
        return jsonb_build_object('success', false, 'error', 'Account is suspended');
    end if;

    select * into v_wallet from public.wallets where user_id = v_uid for update;
    if v_wallet is null then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    if v_wallet.balance < p_prize_amount then
        return jsonb_build_object('success', false, 'error', 'Insufficient balance',
            'balance', v_wallet.balance, 'required', p_prize_amount);
    end if;

    insert into public.giveaways (
        host_id, title, description, prize_amount, prize_currency,
        game_type, game_duration_seconds, min_trust_tier, max_participants,
        status, scheduled_start_at, allow_sharing,
        number_of_winners, prevent_previous_winners_hours
    )
    values (
        v_uid, trim(p_title), p_description, p_prize_amount, 'NGN',
        p_game_type, p_duration_seconds, p_min_trust_tier, p_max_participants,
        'scheduled', p_scheduled_start, p_allow_sharing,
        p_number_of_winners, p_prevent_previous_winners_hours
    )
    returning id into v_giveaway_id;

    update public.wallets
    set balance        = balance - p_prize_amount,
        escrow_balance = escrow_balance + p_prize_amount,
        updated_at     = now()
    where id = v_wallet.id;

    insert into public.escrow (giveaway_id, host_id, amount, status)
    values (v_giveaway_id, v_uid, p_prize_amount, 'held');

    insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, status, reference_type, reference_id, description
    )
    values (
        v_wallet.id, v_uid, 'prize_escrow', p_prize_amount, 0, p_prize_amount,
        v_wallet.balance, v_wallet.balance - p_prize_amount, 'completed', 'giveaway', v_giveaway_id,
        'Prize held for giveaway: ' || trim(p_title)
    );

    return jsonb_build_object('success', true, 'giveaway_id', v_giveaway_id, 'prize_amount', p_prize_amount);
end;
$$;

create or replace function public.start_giveaway_event(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_giveaway record;
    v_ends_at  timestamptz;
begin
    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;

    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;

    if v_giveaway.host_id <> auth.uid() and not public.is_admin() then
        return jsonb_build_object('success', false, 'error', 'Only the host can start this event');
    end if;

    if v_giveaway.status <> 'scheduled' then
        return jsonb_build_object('success', false, 'error', 'Event is not in lobby state');
    end if;

    v_ends_at := now() + (v_giveaway.game_duration_seconds || ' seconds')::interval + interval '5 seconds';

    update public.giveaways
    set status = 'live', starts_at = now(), ends_at = v_ends_at, updated_at = now()
    where id = p_giveaway_id;

    return jsonb_build_object('success', true, 'starts_at', now(), 'ends_at', v_ends_at);
end;
$$;

-- complete_giveaway: picks the winner and ends the giveaway. Does NOT move money —
-- the winner pulls the prize via claim_prize(). That split is the design in
-- prize_claim_system.sql and it is what the client implements, so it is canonical here.
--
-- Authorization (P0-9): the host or an admin may end it early. Anyone else may end it
-- ONLY once ends_at has actually passed. That keeps the existing client-side fallback
-- working while removing the "end it the moment I take the lead" attack.
--
-- KNOWN GAP (Phase 1): this still relies on some client being open to fire the call at
-- ends_at. Replace with pg_cron so a giveaway ends whether or not anyone is watching.
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

    -- Nobody actually played: refund the host in full.
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

    -- NOTE: number_of_winners is collected by the create form and stored, but only one
    -- winner is selected here. wallet_schema.sql contained a multi-winner variant that
    -- split the escrow. Implementing that properly (partial escrow release, per-winner
    -- claim rows) is Phase 3 — until then the create form should not offer the option.
    update public.giveaways
    set status                 = 'ended',
        winner_id              = v_winner.user_id,
        winner_fingerprint_id  = v_winner.fingerprint_id,
        winning_score          = v_winner.score,
        ends_at                = least(coalesce(ends_at, now()), now()),
        updated_at             = now()
    where id = p_giveaway_id;

    if v_winner.user_id is not null then
        update public.giveaway_participants
        set is_winner = true
        where giveaway_id = p_giveaway_id and user_id = v_winner.user_id;

        update public.profiles
        set total_wins = total_wins + 1, updated_at = now()
        where id = v_winner.user_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'status', 'ended',
        'winner_id', v_winner.user_id,
        'winner_fingerprint_id', v_winner.fingerprint_id,
        'winner_username', v_winner.username,
        'winning_score', v_winner.score,
        'prize_amount', v_escrow.amount,
        'is_guest', v_winner.participant_type = 'guest'
    );
end;
$$;

create or replace function public.claim_prize(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid      uuid := auth.uid();
    v_giveaway record;
    v_escrow   record;
    v_wallet   record;
    v_balance  numeric;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    -- Lock first, then check. Locking after the checks would leave a window in which
    -- two concurrent claims both pass the prize_claimed_at test.
    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;

    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;
    if v_giveaway.status <> 'ended' then
        return jsonb_build_object('success', false, 'error', 'Giveaway has not ended');
    end if;
    if v_giveaway.winner_id is distinct from v_uid then
        return jsonb_build_object('success', false, 'error', 'You are not the winner of this giveaway');
    end if;
    if v_giveaway.prize_claimed_at is not null then
        return jsonb_build_object('success', false, 'error', 'Prize already claimed');
    end if;

    select * into v_escrow
    from public.escrow
    where giveaway_id = p_giveaway_id and status = 'held'
    for update;

    if v_escrow is null then
        return jsonb_build_object('success', false, 'error', 'Prize funds unavailable');
    end if;

    select * into v_wallet from public.wallets where user_id = v_uid for update;
    if v_wallet is null then
        insert into public.wallets (user_id) values (v_uid) returning * into v_wallet;
    end if;

    -- total_earned, not total_deposited. The legacy version credited total_deposited,
    -- which inflated the admin "total deposited" figure with internal prize transfers.
    update public.wallets
    set balance      = balance + v_escrow.amount,
        total_earned = total_earned + v_escrow.amount,
        updated_at   = now()
    where id = v_wallet.id
    returning balance into v_balance;

    update public.wallets
    set escrow_balance = greatest(0, escrow_balance - v_escrow.amount), updated_at = now()
    where user_id = v_giveaway.host_id;

    update public.escrow
    set status = 'released', released_to = v_uid, released_at = now()
    where id = v_escrow.id;

    update public.giveaways
    set prize_claimed_at = now(), updated_at = now()
    where id = p_giveaway_id;

    insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, status, reference_type, reference_id, description
    )
    values (
        v_wallet.id, v_uid, 'prize_release', v_escrow.amount, 0, v_escrow.amount,
        v_balance - v_escrow.amount, v_balance, 'completed', 'giveaway', p_giveaway_id,
        'Prize claimed: ' || v_giveaway.title
    );

    update public.profiles
    set total_winnings = total_winnings + v_escrow.amount, updated_at = now()
    where id = v_uid;

    return jsonb_build_object('success', true, 'prize_amount', v_escrow.amount, 'claimed_at', now());
end;
$$;

-- =============================================================================
-- SECTION F — KYC (repointed off the user-writable is_host flag)
-- =============================================================================

create or replace function public.approve_kyc_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_request record;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_request from public.kyc_requests where id = p_request_id for update;
    if not found then
        return jsonb_build_object('success', false, 'error', 'KYC request not found');
    end if;
    if v_request.status <> 'pending' then
        return jsonb_build_object('success', false, 'error', 'KYC request is not pending');
    end if;

    update public.kyc_requests
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    where id = p_request_id;

    update public.profiles
    set id_verified = true,
        trust_score = greatest(trust_score, 80),
        updated_at  = now()
    where id = v_request.user_id;
    -- trust_tier is intentionally not set here; the on_trust_score_change trigger
    -- derives it from trust_score via tier_for_score(). Setting both by hand is what
    -- produced the three conflicting tier ladders in the first place.

    insert into public.notifications (user_id, type, title, message, link)
    values (v_request.user_id, 'kyc', '✅ Identity Verified',
            'Your KYC has been approved. Your withdrawal limits and cooldowns have been upgraded.',
            '/trust');

    perform public.log_admin_action(
        'kyc.approve', 'kyc_request', p_request_id, null, null,
        jsonb_build_object('user_id', v_request.user_id)
    );

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.reject_kyc_request(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_request record;
begin
    if not public.is_admin_or_service() then
        return jsonb_build_object('success', false, 'error', 'Unauthorized');
    end if;

    select * into v_request from public.kyc_requests where id = p_request_id for update;
    if not found then
        return jsonb_build_object('success', false, 'error', 'KYC request not found');
    end if;
    if v_request.status <> 'pending' then
        return jsonb_build_object('success', false, 'error', 'KYC request is not pending');
    end if;

    update public.kyc_requests
    set status = 'rejected', rejection_reason = p_reason,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    where id = p_request_id;

    insert into public.notifications (user_id, type, title, message, link)
    values (v_request.user_id, 'kyc', '❌ KYC Submission Rejected',
            'Your KYC submission was rejected. Reason: ' || coalesce(p_reason, 'Documents unclear.') ||
            '. Please resubmit with clearer documents.',
            '/trust/kyc');

    perform public.log_admin_action(
        'kyc.reject', 'kyc_request', p_request_id, null, p_reason,
        jsonb_build_object('user_id', v_request.user_id)
    );

    return jsonb_build_object('success', true);
end;
$$;

-- =============================================================================
-- SECTION G — misc legacy functions, hardened in place
-- =============================================================================

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    update public.notifications
    set is_read = true
    where user_id = auth.uid() and is_read = false;
end;
$$;

-- KNOWN GAP (Phase 1, highest priority): link_guest_to_user trusts a fingerprint string
-- supplied by the caller, and winner_fingerprint_id is readable from the giveaways table.
-- An attacker can therefore read a guest winner's fingerprint and claim their prize by
-- signing up and calling this with it. Closing that needs a server-issued, signed guest
-- token minted at guest-join time — deliberately out of scope for Phase 0 rather than
-- half-fixed here. Until it lands, guest prizes should be reviewed before payout.
create or replace function public.link_guest_to_user(p_fingerprint_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid          uuid := auth.uid();
    v_linked_count integer;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;
    if coalesce(trim(p_fingerprint_id), '') = '' then
        return jsonb_build_object('success', false, 'error', 'Fingerprint required');
    end if;

    update public.guest_participants
    set linked_user_id = v_uid, linked_at = now()
    where fingerprint_id = p_fingerprint_id and linked_user_id is null;

    get diagnostics v_linked_count = row_count;

    insert into public.giveaway_participants (
        giveaway_id, user_id, score, taps, best_streak, joined_at, completed_at
    )
    select gp.giveaway_id, v_uid, gp.score, gp.taps, gp.best_streak, gp.joined_at, gp.completed_at
    from public.guest_participants gp
    join public.giveaways g on g.id = gp.giveaway_id
    where gp.fingerprint_id = p_fingerprint_id
      and gp.linked_user_id = v_uid
      and g.status in ('live', 'scheduled')
    on conflict (giveaway_id, user_id) do update
    set score        = excluded.score,
        taps         = excluded.taps,
        best_streak  = excluded.best_streak,
        completed_at = excluded.completed_at;

    update public.giveaways
    set winner_id = v_uid
    where winner_fingerprint_id = p_fingerprint_id and winner_id is null;

    return jsonb_build_object('success', true, 'linked_count', v_linked_count);
end;
$$;

commit;

select 'Phase 0 / 3 of 5 — privileged functions now authorize, lock rows and pin search_path' as result;
