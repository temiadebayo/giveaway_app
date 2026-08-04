-- =============================================================================
-- SECURITY VERIFICATION — read-only, safe to re-run at any time
--
-- Run after applying migrations. Every row must say PASS.
--
-- A FAIL means a privilege exists that should not, most often because something was
-- granted by hand in the SQL editor. Re-running 00000000000003_security.sql restores
-- the intended state.
--
-- Not a migration — it changes nothing, which is why it lives in checks/.
-- =============================================================================

with checks as (

    -- Money tables: readable, never writable by a client role -----------------
    select 'money' as area, 'wallets not writable by authenticated' as check_name,
           not (has_table_privilege('authenticated', 'public.wallets', 'INSERT')
             or has_table_privilege('authenticated', 'public.wallets', 'UPDATE')
             or has_table_privilege('authenticated', 'public.wallets', 'DELETE')) as passed

    union all select 'money', 'wallet_transactions not writable by authenticated',
           not (has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT')
             or has_table_privilege('authenticated', 'public.wallet_transactions', 'UPDATE'))

    union all select 'money', 'withdrawal_requests not insertable by authenticated',
           not has_table_privilege('authenticated', 'public.withdrawal_requests', 'INSERT')

    union all select 'money', 'escrow not writable by authenticated',
           not (has_table_privilege('authenticated', 'public.escrow', 'INSERT')
             or has_table_privilege('authenticated', 'public.escrow', 'UPDATE'))

    -- Privilege escalation via profiles ---------------------------------------
    union all select 'profiles', 'trust_score not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'trust_score', 'UPDATE')

    union all select 'profiles', 'trust_tier not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'trust_tier', 'UPDATE')

    union all select 'profiles', 'id_verified not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'id_verified', 'UPDATE')

    union all select 'profiles', 'phone_verified not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'phone_verified', 'UPDATE')

    union all select 'profiles', 'withdrawal_limit not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'withdrawal_limit', 'UPDATE')

    union all select 'profiles', 'is_banned not updatable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'is_banned', 'UPDATE')

    -- is_host is gone entirely: it was an authorization flag users could set on
    -- themselves, and it gated KYC approval plus access to uploaded ID documents.
    union all select 'profiles', 'is_host column no longer exists',
           not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_host')

    union all select 'profiles', 'username IS still readable by anon (leaderboards need it)',
           has_column_privilege('anon', 'public.profiles', 'username', 'SELECT')

    -- PII ---------------------------------------------------------------------
    union all select 'pii', 'email not readable by anon',
           not has_column_privilege('anon', 'public.profiles', 'email', 'SELECT')

    union all select 'pii', 'email not readable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT')

    union all select 'pii', 'phone not readable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT')

    union all select 'pii', 'account_number not readable by authenticated',
           not has_column_privilege('authenticated', 'public.profiles', 'account_number', 'SELECT')

    -- Admin -------------------------------------------------------------------
    union all select 'admin', 'admin_users not writable by authenticated',
           not (has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
             or has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
             or has_table_privilege('authenticated', 'public.admin_users', 'DELETE'))

    union all select 'admin', 'admin roster is populated',
           (select count(*) from public.admin_users) > 0

    union all select 'admin', 'approve_deposit not executable by authenticated',
           not has_function_privilege('authenticated', 'public.approve_deposit(uuid)', 'EXECUTE')

    union all select 'admin', 'approve_withdrawal not executable by authenticated',
           not has_function_privilege('authenticated', 'public.approve_withdrawal(uuid)', 'EXECUTE')

    union all select 'admin', 'approve_kyc_request not executable by authenticated',
           not has_function_privilege('authenticated', 'public.approve_kyc_request(uuid)', 'EXECUTE')

    -- Functions ---------------------------------------------------------------
    union all select 'functions', 'no application function is executable by PUBLIC',
           not exists (
               select 1 from pg_proc p
               where p.pronamespace = 'public'::regnamespace
                 and not exists (select 1 from pg_depend d
                                 where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
                 and has_function_privilege('public', p.oid, 'EXECUTE'))

    union all select 'functions', 'every security definer function pins search_path',
           not exists (
               select 1 from pg_proc p
               where p.pronamespace = 'public'::regnamespace
                 and p.prosecdef
                 and not exists (select 1 from pg_depend d
                                 where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
                 and (p.proconfig is null
                      or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%')))

    union all select 'functions', 'request_withdrawal takes no fee or hold argument',
           not exists (select 1 from pg_proc
                       where pronamespace = 'public'::regnamespace
                         and proname = 'request_withdrawal' and pronargs > 2)

    -- Game integrity -----------------------------------------------------------
    union all select 'game', 'submit_score accepts tap timings, not a score',
           exists (select 1 from pg_proc
                   where pronamespace = 'public'::regnamespace
                     and proname = 'submit_score'
                     and pg_get_function_identity_arguments(oid) like '%integer[]%')

    union all select 'game', 'only one submit_score definition exists',
           (select count(*) from pg_proc
            where pronamespace = 'public'::regnamespace and proname = 'submit_score') = 1

    union all select 'game', 'only one complete_giveaway definition exists',
           (select count(*) from pg_proc
            where pronamespace = 'public'::regnamespace and proname = 'complete_giveaway') = 1

    union all select 'game', 'giveaway_participants not writable by authenticated',
           not (has_table_privilege('authenticated', 'public.giveaway_participants', 'INSERT')
             or has_table_privilege('authenticated', 'public.giveaway_participants', 'UPDATE'))

    union all select 'game', 'giveaways not writable by authenticated',
           not (has_table_privilege('authenticated', 'public.giveaways', 'INSERT')
             or has_table_privilege('authenticated', 'public.giveaways', 'UPDATE'))

    -- Guests --------------------------------------------------------------------
    union all select 'guests', 'guest_participants not writable by anon',
           not (has_table_privilege('anon', 'public.guest_participants', 'INSERT')
             or has_table_privilege('anon', 'public.guest_participants', 'UPDATE'))

    union all select 'guests', 'guest fingerprint not readable by clients',
           not has_column_privilege('anon', 'public.guest_participants', 'fingerprint_id', 'SELECT')

    union all select 'guests', 'guest_sessions unreadable by every client role',
           not (has_table_privilege('anon', 'public.guest_sessions', 'SELECT')
             or has_table_privilege('authenticated', 'public.guest_sessions', 'SELECT'))

    union all select 'guests', 'link_guest_to_user (fingerprint-authorised) is gone',
           not exists (select 1 from pg_proc
                       where pronamespace = 'public'::regnamespace and proname = 'link_guest_to_user')

    union all select 'guests', 'giveaways.winner_fingerprint_id no longer exists',
           not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'giveaways'
                         and column_name = 'winner_fingerprint_id')

    -- Fraud signals ---------------------------------------------------------------
    union all select 'fraud', 'device flag state not readable by clients',
           not has_column_privilege('authenticated', 'public.device_fingerprints', 'is_flagged', 'SELECT')

    union all select 'fraud', 'device_fingerprints not writable by clients',
           not (has_table_privilege('anon', 'public.device_fingerprints', 'INSERT')
             or has_table_privilege('authenticated', 'public.device_fingerprints', 'UPDATE'))

    -- Notifications ----------------------------------------------------------------
    union all select 'misc', 'notifications not insertable by authenticated',
           not has_table_privilege('authenticated', 'public.notifications', 'INSERT')

    -- Things that must still work ----------------------------------------------------
    union all select 'smoke', 'submit_score executable by authenticated',
           has_function_privilege('authenticated', 'public.submit_score(uuid, integer[], integer)', 'EXECUTE')

    union all select 'smoke', 'join_giveaway executable by authenticated',
           has_function_privilege('authenticated', 'public.join_giveaway(uuid, text)', 'EXECUTE')

    union all select 'smoke', 'get_my_profile executable by authenticated',
           has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')

    union all select 'smoke', 'claim_guest_session executable by authenticated',
           has_function_privilege('authenticated', 'public.claim_guest_session(text)', 'EXECUTE')

    union all select 'smoke', 'complete_giveaway executable by anon (end-of-round fallback)',
           has_function_privilege('anon', 'public.complete_giveaway(uuid)', 'EXECUTE')

    union all select 'smoke', 'combined_leaderboard readable by anon',
           has_table_privilege('anon', 'public.combined_leaderboard', 'SELECT')

    union all select 'smoke', 'every profile has a wallet',
           not exists (select 1 from public.profiles p
                       left join public.wallets w on w.user_id = p.id where w.id is null)
)
select case when passed then '✅ PASS' else '❌ FAIL' end as status, area, check_name
from checks
order by passed asc, area, check_name;
