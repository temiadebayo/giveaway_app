-- =============================================================================
-- 04 — SEED
--
-- Two jobs:
--   1. Backfill profiles and wallets for auth.users accounts that survived the reset.
--      The reset dropped `public` but left `auth` alone, so existing logins still work
--      — but their profile rows are gone, and handle_new_user() only fires on INSERT.
--      Without this step, everyone who already had an account can sign in and then hit
--      a broken app.
--   2. Seed the admin roster.
--
-- >>> EDIT THE ADMIN EMAIL BELOW BEFORE RUNNING. <<<
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- OPTIONAL — total clean slate
--
-- Everything above assumes you want existing logins to keep working. If you would
-- rather start with zero accounts (including your own — you would sign up again
-- afterwards), uncomment the line below. It cascades into every table via the
-- profiles -> auth.users foreign key.
--
-- Leave it commented if you are unsure. Deleting accounts is not reversible without
-- the backup, and keeping them costs nothing.
-- -----------------------------------------------------------------------------
-- delete from auth.users;

-- -----------------------------------------------------------------------------
-- 1. Backfill profiles for surviving auth users
--
-- Usernames must be unique. Two accounts can easily share a local-part
-- (alex@gmail.com and alex@outlook.com), so collisions get a short id suffix rather
-- than failing the whole migration.
-- -----------------------------------------------------------------------------
insert into public.profiles (id, email, username, display_name, avatar_url, created_at)
select
    u.id,
    u.email,
    case
        when row_number() over (
                 partition by coalesce(u.raw_user_meta_data ->> 'username', split_part(u.email, '@', 1))
                 order by u.created_at
             ) = 1
        then coalesce(u.raw_user_meta_data ->> 'username', split_part(u.email, '@', 1))
        else coalesce(u.raw_user_meta_data ->> 'username', split_part(u.email, '@', 1))
             || '_' || substr(u.id::text, 1, 6)
    end,
    coalesce(u.raw_user_meta_data ->> 'full_name',
             u.raw_user_meta_data ->> 'name',
             split_part(u.email, '@', 1)),
    u.raw_user_meta_data ->> 'avatar_url',
    u.created_at
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- Every profile gets a wallet, at zero. Balances are NOT restored — they lived in the
-- dropped schema. If real balances need reinstating, do it from the backup with
-- explicit wallet_transactions rows so the ledger reconciles.
insert into public.wallets (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Admin roster
--
-- >>> CHANGE THIS EMAIL <<<
-- Inserts only if that account already exists in auth.users. If it reports 0 rows,
-- sign up with that address first, then re-run this block on its own.
-- -----------------------------------------------------------------------------
insert into public.admin_users (user_id, email, role, notes)
select u.id, u.email, 'superadmin', 'Seeded at rebuild'
from auth.users u
where lower(u.email) = lower('temiadebayo1@gmail.com')
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Recompute trust scores from database facts
--
-- Profiles were recreated at the default score of 20. This derives each one properly
-- from email confirmation, account age and so on. It intentionally does NOT restore
-- prior id_verified / phone_verified state — those were evidence-backed claims whose
-- evidence is gone, so users re-verify. That is the honest default for a system whose
-- whole point is trust.
-- -----------------------------------------------------------------------------
update public.profiles p
set trust_score = least(100, greatest(0,
        10
      + case when u.email_confirmed_at is not null then 10 else 0 end
      + case when extract(epoch from (now() - u.created_at)) / 86400 >= 30 then 20
             when extract(epoch from (now() - u.created_at)) / 86400 >= 7  then 10
             else 0 end
      + case when p.avatar_url is not null then 2 else 0 end
      + case when coalesce(p.username, '') <> '' then 1 else 0 end))
from auth.users u
where u.id = p.id;

-- -----------------------------------------------------------------------------
-- Report
-- -----------------------------------------------------------------------------
do $$
declare v_users integer; v_profiles integer; v_wallets integer; v_admins integer;
begin
    select count(*) into v_users    from auth.users;
    select count(*) into v_profiles from public.profiles;
    select count(*) into v_wallets  from public.wallets;
    select count(*) into v_admins   from public.admin_users;

    raise notice '--------------------------------------------';
    raise notice 'auth.users:    %', v_users;
    raise notice 'profiles:      %', v_profiles;
    raise notice 'wallets:       %', v_wallets;
    raise notice 'admin_users:   %', v_admins;
    raise notice '--------------------------------------------';

    if v_admins = 0 then
        raise warning 'NO ADMIN SEEDED. The admin panel is unreachable until you insert a row into public.admin_users.';
    end if;

    if v_profiles < v_users then
        raise warning '% auth user(s) have no profile — they have a null email and were skipped.', v_users - v_profiles;
    end if;
end $$;

commit;

select 'Rebuild complete. Run 20260802120500_phase0_verify.sql to confirm.' as result;
