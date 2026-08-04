        -- =============================================================================
        -- 02 — FUNCTIONS AND TRIGGERS
        --
        -- Every function here is `security definer` with a pinned `search_path`. Without the
        -- pin, an unqualified name inside the body resolves against the CALLER's search_path,
        -- so a caller able to create objects in an earlier schema can shadow a table and have
        -- the function operate on it with the owner's privileges.
        --
        -- Every money path locks the rows it is about to read-then-write.
        -- Grants are in file 03 — nothing here is callable until it is granted there.
        -- =============================================================================

        begin;

        -- =============================================================================
        -- TIER MODEL — one definition
        --
        -- The pre-reset database had three disagreeing versions of this (schema.sql,
        -- phone_verification_trust.sql and the TypeScript engine). These are the numbers;
        -- src/lib/trust-engine.ts and src/lib/wallet-service.ts mirror them, and
        -- src/lib/__tests__/wallet-fees.test.ts asserts the mirror stays true.
        -- =============================================================================

        create or replace function public.tier_for_score(p_score integer)
        returns text language sql immutable as $$
            select case when p_score >= 86 then 'diamond'
                        when p_score >= 61 then 'gold'
                        when p_score >= 31 then 'silver'
                        else 'bronze' end;
        $$;

        create or replace function public.tier_rank(p_tier text)
        returns integer language sql immutable as $$
            select case p_tier when 'diamond' then 4 when 'gold' then 3 when 'silver' then 2 else 1 end;
        $$;

        create or replace function public.withdrawal_limit_for_tier(p_tier text)
        returns numeric language sql immutable as $$
            select case p_tier when 'diamond' then 500000::numeric
                               when 'gold'    then 100000::numeric
                               when 'silver'  then  50000::numeric
                               else            10000::numeric end;
        $$;

        create or replace function public.withdrawal_cooldown_hours(p_tier text)
        returns integer language sql immutable as $$
            select case p_tier when 'diamond' then 6 when 'gold' then 24 else 48 end;
        $$;

        -- Authoritative fee schedule. deposit_fee_percent is 0 because no deposit fee is
        -- actually charged by request_deposit() — the 5% the UI used to advertise was never
        -- implemented. Set it here and implement it there if it is meant to be charged.
        create or replace function public.get_fee_schedule()
        returns jsonb language sql stable as $$
            select jsonb_build_object(
                'deposit_fee_percent',    0.0,
                'withdrawal_fee_percent', 5.0,
                'max_deposit',        5000000.0,
                'max_withdrawal',      500000.0,
                'currency',               'NGN');
        $$;

        -- =============================================================================
        -- AUTHORIZATION
        -- =============================================================================

        create or replace function public.is_admin(p_user_id uuid default auth.uid())
        returns boolean language sql stable security definer set search_path = public, pg_temp as $$
            select exists (select 1 from public.admin_users a where a.user_id = p_user_id);
        $$;

        -- Admin RPCs are invoked from Next.js server actions using the service role key, where
        -- there is no JWT and auth.uid() is null. Holding that key already implies full trust,
        -- so accepting it grants nothing new — but it means the APPLICATION must identify the
        -- operator before calling. See requireAdmin() in src/lib/admin-auth.ts.
        create or replace function public.is_admin_or_service()
        returns boolean language sql stable security definer set search_path = public, pg_temp as $$
            select public.is_admin()
                or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
        $$;

        create or replace function public.log_admin_action(
            p_action text, p_target_type text default null, p_target_id uuid default null,
            p_amount numeric default null, p_reason text default null, p_metadata jsonb default '{}')
        returns void language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_email text;
        begin
            select email into v_email from public.admin_users where user_id = auth.uid();
            insert into public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, amount, reason, metadata)
            values (auth.uid(), coalesce(v_email, 'service_role'), p_action, p_target_type, p_target_id,
                    p_amount, p_reason, coalesce(p_metadata, '{}'));
        end;
        $$;

        -- Returns the caller's own row in full, including columns revoked from client roles.
        -- Takes no argument on purpose: a function accepting a user_id is a function someone
        -- eventually passes someone else's user_id to.
        create or replace function public.get_my_profile()
        returns public.profiles language sql stable security definer set search_path = public, pg_temp as $$
            select p.* from public.profiles p where p.id = auth.uid();
        $$;

        -- =============================================================================
        -- TRIGGERS
        -- =============================================================================

        -- New auth user -> profile + wallet, in one place. Previously two separate triggers
        -- that could partially fire, which is why the client had fallback profile-creation code.
        create or replace function public.handle_new_user()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_username text;
        begin
            v_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));

            insert into public.profiles (id, email, username, display_name, avatar_url)
            values (
                new.id, new.email,
                -- Usernames are unique; fall back to a suffixed form rather than failing signup.
                case when exists (select 1 from public.profiles where username = v_username)
                     then v_username || '_' || substr(new.id::text, 1, 6)
                     else v_username end,
                coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', v_username),
                new.raw_user_meta_data ->> 'avatar_url')
            on conflict (id) do nothing;

            insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
            return new;
        end;
        $$;

        drop trigger if exists on_auth_user_created on auth.users;
        create trigger on_auth_user_created
            after insert on auth.users
            for each row execute function public.handle_new_user();

        create or replace function public.update_trust_tier()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            new.trust_tier       := public.tier_for_score(new.trust_score);
            new.withdrawal_limit := public.withdrawal_limit_for_tier(new.trust_tier);
            new.updated_at       := now();
            return new;
        end;
        $$;

        create trigger on_trust_score_change
            before update of trust_score on public.profiles
            for each row execute function public.update_trust_tier();

        create or replace function public.log_trust_change()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            if old.trust_score is distinct from new.trust_score then
                insert into public.trust_events (user_id, event_type, score_before, score_after, score_change, reason)
                values (new.id, 'score_update', old.trust_score, new.trust_score,
                        new.trust_score - old.trust_score, 'Trust score recalculated');
            end if;
            return new;
        end;
        $$;

        create trigger on_trust_score_log
            after update of trust_score on public.profiles
            for each row execute function public.log_trust_change();

        -- Changing a phone number invalidates its verified status, otherwise a user verifies
        -- one number, banks the trust score, then swaps in another.
        create or replace function public.reset_phone_verification_on_change()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            if new.phone is distinct from old.phone then
                new.phone_verified := false;
            end if;
            return new;
        end;
        $$;

        create trigger on_phone_change_reset_verification
            before update of phone on public.profiles
            for each row execute function public.reset_phone_verification_on_change();

        create or replace function public.update_participant_rank()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            with ranked as (
                select id, row_number() over (order by score desc, completed_at asc nulls last) as new_rank
                from public.giveaway_participants
                where giveaway_id = new.giveaway_id
            )
            update public.giveaway_participants p
            set rank = r.new_rank
            from ranked r
            where p.id = r.id and p.rank is distinct from r.new_rank;
            return new;
        end;
        $$;

        create trigger on_score_update
            after update of score on public.giveaway_participants
            for each row execute function public.update_participant_rank();

        create or replace function public.generate_share_code()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            new.share_code := lower(substring(md5(new.id::text || clock_timestamp()::text) for 8));
            return new;
        end;
        $$;

        create trigger on_giveaway_share_code
            before insert on public.giveaways
            for each row execute function public.generate_share_code();

        -- =============================================================================
        -- ACCOUNT / TRUST RPCs
        -- =============================================================================

        create or replace function public.ensure_wallet()
        returns public.wallets language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_wallet public.wallets; v_user record;
        begin
            if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

            select * into v_wallet from public.wallets where user_id = v_uid;
            if found then return v_wallet; end if;

            if not exists (select 1 from public.profiles where id = v_uid) then
                select id, email, raw_user_meta_data into v_user from auth.users where id = v_uid;
                insert into public.profiles (id, email, username, display_name)
                values (v_uid, v_user.email,
                        coalesce(v_user.raw_user_meta_data ->> 'username', split_part(v_user.email, '@', 1)) || '_' || substr(v_uid::text, 1, 6),
                        coalesce(v_user.raw_user_meta_data ->> 'full_name', split_part(v_user.email, '@', 1)))
                on conflict (id) do nothing;
            end if;

            insert into public.wallets (user_id) values (v_uid) on conflict (user_id) do nothing;
            select * into v_wallet from public.wallets where user_id = v_uid;
            return v_wallet;
        end;
        $$;

        -- Never touches is_flagged / flag_reason: a user must not be able to clear moderation
        -- state on their own device.
        create or replace function public.register_device(
            p_hash text, p_canvas text default null, p_webgl jsonb default null,
            p_audio text default null, p_screen text default null, p_confidence integer default 0)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_fp_id uuid;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
            if coalesce(trim(p_hash), '') = '' then return jsonb_build_object('success', false, 'error', 'Fingerprint hash required'); end if;

            insert into public.device_fingerprints (fingerprint_hash, canvas_hash, webgl_info, audio_hash, screen_info, confidence)
            values (p_hash, p_canvas, p_webgl, p_audio, p_screen, greatest(0, least(100, coalesce(p_confidence, 0))))
            on conflict (fingerprint_hash) do update
                set times_seen   = public.device_fingerprints.times_seen + 1,
                    last_seen_at = now(),
                    confidence   = greatest(0, least(100, coalesce(excluded.confidence, 0)))
            returning id into v_fp_id;

            insert into public.user_devices (user_id, fingerprint_id, last_used_at)
            values (v_uid, v_fp_id, now())
            on conflict (user_id, fingerprint_id) do update set last_used_at = now();

            return jsonb_build_object('success', true, 'fingerprint_id', v_fp_id);
        end;
        $$;

        -- Derives the score from database facts only. The client may ask for a recalculation
        -- but cannot influence the result. Mirrors the weights in src/lib/trust-engine.ts.
        create or replace function public.recalculate_trust_score()
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare
            v_uid uuid := auth.uid(); v_profile public.profiles; v_auth record;
            v_score integer := 10; v_before integer; v_age numeric;
            v_devices integer; v_flagged integer; v_shared integer; v_complete integer := 0;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select * into v_profile from public.profiles where id = v_uid;
            if v_profile is null then return jsonb_build_object('success', false, 'error', 'Profile not found'); end if;

            v_before := v_profile.trust_score;
            select email_confirmed_at, created_at into v_auth from auth.users where id = v_uid;

            if v_auth.email_confirmed_at is not null then v_score := v_score + 10; end if;
            if v_profile.phone_verified then v_score := v_score + 20; end if;
            if v_profile.id_verified    then v_score := v_score + 30; end if;

            v_age := extract(epoch from (now() - v_auth.created_at)) / 86400;
            if v_age >= 30 then v_score := v_score + 20;
            elsif v_age >= 7 then v_score := v_score + 10; end if;

            if v_profile.avatar_url is not null       then v_complete := v_complete + 2; end if;
            if coalesce(v_profile.bio, '') <> ''      then v_complete := v_complete + 2; end if;
            if coalesce(v_profile.username, '') <> '' then v_complete := v_complete + 1; end if;
            v_score := v_score + least(v_complete, 5);

            select count(*) into v_devices from public.user_devices where user_id = v_uid;
            select count(*) into v_flagged
            from public.user_devices ud
            join public.device_fingerprints df on df.id = ud.fingerprint_id
            where ud.user_id = v_uid and df.is_flagged;

            if v_devices > 0 and v_flagged = 0 then v_score := v_score + 20; end if;
            v_score := v_score + least(v_profile.total_wins * 5, 25);
            if v_flagged > 0 then v_score := v_score - 50; end if;

            -- Multiple accounts sharing one device.
            select count(distinct ud2.user_id) into v_shared
            from public.user_devices ud1
            join public.user_devices ud2 on ud2.fingerprint_id = ud1.fingerprint_id
            where ud1.user_id = v_uid and ud2.user_id <> v_uid;
            if v_shared > 0 then v_score := v_score - 40; end if;

            v_score := greatest(0, least(100, v_score));

            update public.profiles set trust_score = v_score, updated_at = now() where id = v_uid;

            return jsonb_build_object('success', true, 'score_before', v_before, 'score', v_score,
                                      'tier', public.tier_for_score(v_score));
        end;
        $$;

        -- Reads verification state from auth.users, which the client cannot forge. The previous
        -- design let the browser set profiles.phone_verified directly, and a trigger then
        -- granted +20 trust — so the points were self-service.
        create or replace function public.sync_phone_verification()
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_user record;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select phone, phone_confirmed_at into v_user from auth.users where id = v_uid;
            if v_user.phone_confirmed_at is null then
                return jsonb_build_object('success', false, 'error', 'Phone number is not verified');
            end if;

            update public.profiles
            set phone = coalesce(v_user.phone, phone), phone_verified = true, updated_at = now()
            where id = v_uid and phone_verified is distinct from true;

            perform public.recalculate_trust_score();
            return jsonb_build_object('success', true, 'phone_verified', true);
        end;
        $$;

        create or replace function public.mark_all_notifications_read()
        returns void language plpgsql security definer set search_path = public, pg_temp as $$
        begin
            update public.notifications set is_read = true where user_id = auth.uid() and not is_read;
        end;
        $$;

        -- =============================================================================
        -- GUEST SESSIONS
        --
        -- A fingerprint is an identifier, not a credential — it is observable by design, so it
        -- can never authorise a claim. The token is the credential; only its hash is stored.
        -- =============================================================================

        create or replace function public.create_guest_session(
            p_fingerprint text default null, p_user_agent text default null, p_ip_address text default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_token text; v_id uuid;
        begin
            -- 244 bits from two v4 UUIDs; avoids a pgcrypto dependency, while sha256() is core.
            v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

            insert into public.guest_sessions (token_hash, fingerprint_id, user_agent, ip_address)
            values (encode(sha256(convert_to(v_token, 'utf8')), 'hex'), p_fingerprint,
                    left(coalesce(p_user_agent, ''), 500), p_ip_address)
            returning id into v_id;

            return jsonb_build_object('session_id', v_id, 'token', v_token);
        end;
        $$;

        create or replace function public.resolve_guest_session(p_token text)
        returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_id uuid;
        begin
            if coalesce(trim(p_token), '') = '' then return null; end if;
            update public.guest_sessions set last_seen_at = now()
            where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
            returning id into v_id;
            return v_id;
        end;
        $$;

        create or replace function public.claim_guest_session(p_token text)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_session record; v_linked integer := 0;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
            if coalesce(trim(p_token), '') = '' then return jsonb_build_object('success', false, 'error', 'Missing session token'); end if;

            select * into v_session from public.guest_sessions
            where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex') for update;

            if v_session is null then return jsonb_build_object('success', false, 'error', 'Invalid session token'); end if;

            -- A session belongs to one account permanently, else two accounts could take turns
            -- claiming the same guest history.
            if v_session.linked_user_id is not null and v_session.linked_user_id <> v_uid then
                return jsonb_build_object('success', false, 'error', 'This guest session is already claimed');
            end if;

            update public.guest_sessions
            set linked_user_id = v_uid, linked_at = coalesce(linked_at, now()), last_seen_at = now()
            where id = v_session.id;

            update public.guest_participants
            set linked_user_id = v_uid, linked_at = now()
            where guest_session_id = v_session.id and linked_user_id is null;
            get diagnostics v_linked = row_count;

            insert into public.giveaway_participants (giveaway_id, user_id, score, taps, best_streak, joined_at, completed_at)
            select gp.giveaway_id, v_uid, gp.score, gp.taps, gp.best_streak, gp.joined_at, gp.completed_at
            from public.guest_participants gp
            join public.giveaways g on g.id = gp.giveaway_id
            where gp.guest_session_id = v_session.id and g.status in ('live', 'scheduled')
            on conflict (giveaway_id, user_id) do update
                set score = excluded.score, taps = excluded.taps,
                    best_streak = excluded.best_streak, completed_at = excluded.completed_at;

            update public.giveaways set winner_id = v_uid, updated_at = now()
            where winner_guest_session_id = v_session.id and winner_id is null;

            return jsonb_build_object('success', true, 'linked_count', v_linked);
        end;
        $$;

        -- =============================================================================
        -- SCORING
        --
        -- score_tap_run is the single implementation, shared by the authenticated and guest
        -- paths. It mirrors src/lib/tap-game-engine.ts exactly; src/lib/__tests__/
        -- scoring-parity.test.ts holds a transcription and fails if the two drift.
        -- =============================================================================

        create or replace function public.score_tap_run(p_offsets integer[], p_duration_seconds integer)
        returns jsonb language plpgsql immutable as $$
        declare
            v_score integer := 0; v_taps integer := 0; v_streak integer := 0; v_best integer := 0;
            v_mult numeric := 1; v_last integer := -1; v_offset integer; v_interval integer;
            v_points integer; v_rejected integer := 0; v_intervals integer[] := '{}';
            v_max_ms integer; v_stddev numeric; v_mean numeric; v_flags text[] := '{}';
        begin
            if p_offsets is null or array_length(p_offsets, 1) is null then
                return jsonb_build_object('valid', true, 'score', 0, 'taps', 0, 'best_streak', 0,
                                          'rejected_taps', 0, 'interval_stddev', 0, 'flags', '[]'::jsonb);
            end if;

            if array_length(p_offsets, 1) > 6000 then
                return jsonb_build_object('valid', false, 'error', 'Too many tap events');
            end if;

            v_max_ms := (coalesce(p_duration_seconds, 30) * 1000) + 1500;

            foreach v_offset in array p_offsets loop
                if v_offset is null or v_offset < 0 or v_offset > v_max_ms then
                    return jsonb_build_object('valid', false, 'error', 'Tap timing outside the round');
                end if;
                if v_offset < v_last then
                    return jsonb_build_object('valid', false, 'error', 'Tap timings are not in order');
                end if;

                if v_last >= 0 then
                    v_interval := v_offset - v_last;
                    -- The engine refuses sub-50ms taps and does NOT advance its last-tap marker,
                    -- so a tap becomes legal again 50ms after the last accepted one.
                    if v_interval < 50 then v_rejected := v_rejected + 1; continue; end if;
                else
                    v_interval := 0;
                end if;

                if v_interval > 500 then v_streak := 0; v_mult := 1;
                elsif v_interval > 0 then v_streak := v_streak + 1; v_mult := least(5, 1 + (v_streak * 0.1));
                end if;

                if v_streak > v_best then v_best := v_streak; end if;

                v_points := floor(10 * v_mult);
                if v_interval between 150 and 250 then v_points := v_points + 5; end if;

                v_score := v_score + v_points;
                v_taps  := v_taps + 1;
                if v_interval > 0 then v_intervals := array_append(v_intervals, v_interval); end if;
                v_last := v_offset;
            end loop;

            -- A human cannot hold an interval to within a few milliseconds over dozens of taps.
            if array_length(v_intervals, 1) >= 15 then
                select stddev_samp(i), avg(i) into v_stddev, v_mean from unnest(v_intervals) i;
                if v_stddev is not null and v_stddev < 8 then
                    v_flags := array_append(v_flags, 'mechanical_timing');
                end if;
                if v_mean is not null and v_mean < 60 and array_length(v_intervals, 1) >= 100 then
                    v_flags := array_append(v_flags, 'sustained_max_rate');
                end if;
            end if;
            if v_rejected > 20 then v_flags := array_append(v_flags, 'excessive_rejected_taps'); end if;

            return jsonb_build_object('valid', true, 'score', v_score, 'taps', v_taps,
                'best_streak', v_best, 'rejected_taps', v_rejected,
                'interval_stddev', round(coalesce(v_stddev, 0), 2), 'flags', to_jsonb(v_flags));
        end;
        $$;

        create or replace function public.submit_score(
            p_giveaway_id uuid, p_tap_offsets integer[], p_client_score integer default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare
            v_uid uuid := auth.uid(); v_giveaway record; v_participant record;
            v_result jsonb; v_score integer; v_flags jsonb; v_rank integer;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select * into v_giveaway from public.giveaways where id = p_giveaway_id;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.status <> 'live' then return jsonb_build_object('success', false, 'error', 'This giveaway is not currently live'); end if;

            select * into v_participant from public.giveaway_participants
            where giveaway_id = p_giveaway_id and user_id = v_uid for update;

            if v_participant is null then return jsonb_build_object('success', false, 'error', 'You have not joined this giveaway'); end if;
            if v_participant.completed_at is not null then return jsonb_build_object('success', false, 'error', 'Score already submitted'); end if;
            if v_giveaway.ends_at is not null and now() > v_giveaway.ends_at + interval '10 seconds' then
                return jsonb_build_object('success', false, 'error', 'The round has already closed');
            end if;

            v_result := public.score_tap_run(p_tap_offsets, v_giveaway.game_duration_seconds);

            if not (v_result ->> 'valid')::boolean then
                insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
                values (v_uid, 'score_rejected', 'security', 'critical', p_giveaway_id,
                        jsonb_build_object('reason', v_result ->> 'error', 'claimed_score', p_client_score));
                return jsonb_build_object('success', false, 'error', 'Invalid score detected');
            end if;

            v_score := (v_result ->> 'score')::integer;
            v_flags := v_result -> 'flags';

            -- The client's figure is a claim, not an input. Record a mismatch but keep the
            -- authoritative score — a float off-by-one must not cost someone a round.
            if p_client_score is not null and abs(p_client_score - v_score) > 5 then
                insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
                values (v_uid, 'score_mismatch', 'security', 'warning', p_giveaway_id,
                        jsonb_build_object('claimed', p_client_score, 'computed', v_score));
            end if;

            if jsonb_array_length(v_flags) > 0 then
                insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
                values (v_uid, 'cheat_detected', 'security', 'warning', p_giveaway_id,
                        jsonb_build_object('flags', v_flags, 'score', v_score,
                                           'interval_stddev', v_result -> 'interval_stddev'));
            end if;

            update public.giveaway_participants
            set score = v_score, taps = (v_result ->> 'taps')::integer,
                best_streak = (v_result ->> 'best_streak')::integer, completed_at = now()
            where id = v_participant.id
            returning rank into v_rank;

            return jsonb_build_object('success', true, 'score', v_score,
                'taps', (v_result ->> 'taps')::integer,
                'best_streak', (v_result ->> 'best_streak')::integer, 'rank', v_rank);
        end;
        $$;

        create or replace function public.submit_guest_score(
            p_giveaway_id uuid, p_session_id uuid, p_tap_offsets integer[], p_client_score integer default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_giveaway record; v_participant record; v_result jsonb; v_score integer; v_flags jsonb;
        begin
            if p_session_id is null then return jsonb_build_object('success', false, 'error', 'Invalid guest session'); end if;

            select * into v_giveaway from public.giveaways where id = p_giveaway_id;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.status <> 'live' then return jsonb_build_object('success', false, 'error', 'This giveaway is not currently live'); end if;

            select * into v_participant from public.guest_participants
            where giveaway_id = p_giveaway_id and guest_session_id = p_session_id for update;

            if v_participant is null then return jsonb_build_object('success', false, 'error', 'You have not joined this giveaway'); end if;
            if v_participant.completed_at is not null then return jsonb_build_object('success', false, 'error', 'Score already submitted'); end if;
            if v_giveaway.ends_at is not null and now() > v_giveaway.ends_at + interval '10 seconds' then
                return jsonb_build_object('success', false, 'error', 'The round has already closed');
            end if;

            v_result := public.score_tap_run(p_tap_offsets, v_giveaway.game_duration_seconds);

            if not (v_result ->> 'valid')::boolean then
                insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
                values ('score_rejected', 'security', 'critical', p_giveaway_id,
                        jsonb_build_object('reason', v_result ->> 'error', 'is_guest', true,
                                           'guest_session_id', p_session_id));
                return jsonb_build_object('success', false, 'error', 'Invalid score detected');
            end if;

            v_score := (v_result ->> 'score')::integer;
            v_flags := v_result -> 'flags';

            if p_client_score is not null and abs(p_client_score - v_score) > 5 then
                insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
                values ('score_mismatch', 'security', 'warning', p_giveaway_id,
                        jsonb_build_object('claimed', p_client_score, 'computed', v_score,
                                           'is_guest', true, 'guest_session_id', p_session_id));
            end if;

            if jsonb_array_length(v_flags) > 0 then
                insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
                values ('cheat_detected', 'security', 'warning', p_giveaway_id,
                        jsonb_build_object('flags', v_flags, 'score', v_score, 'is_guest', true,
                                           'guest_session_id', p_session_id));
            end if;

            update public.guest_participants
            set score = v_score, taps = (v_result ->> 'taps')::integer,
                best_streak = (v_result ->> 'best_streak')::integer, completed_at = now()
            where id = v_participant.id;

            return jsonb_build_object('success', true, 'score', v_score,
                'taps', (v_result ->> 'taps')::integer,
                'best_streak', (v_result ->> 'best_streak')::integer);
        end;
        $$;

        -- =============================================================================
        -- GIVEAWAY LIFECYCLE
        -- =============================================================================

        create or replace function public.create_giveaway_with_escrow(
            p_title text, p_description text, p_prize_amount numeric,
            p_game_type text default 'tap', p_duration_seconds integer default 30,
            p_min_trust_tier text default 'bronze', p_max_participants integer default 1000,
            p_scheduled_start timestamptz default null, p_allow_sharing boolean default true,
            p_number_of_winners integer default 1, p_prevent_previous_winners_hours integer default 0)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_wallet record; v_profile record; v_id uuid;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
            if p_prize_amount is null or p_prize_amount <= 0 then return jsonb_build_object('success', false, 'error', 'Prize amount must be greater than zero'); end if;
            if coalesce(trim(p_title), '') = '' then return jsonb_build_object('success', false, 'error', 'Title is required'); end if;
            if p_duration_seconds not between 5 and 300 then return jsonb_build_object('success', false, 'error', 'Duration must be between 5 and 300 seconds'); end if;
            if p_number_of_winners < 1 then return jsonb_build_object('success', false, 'error', 'Must have at least one winner'); end if;
            if p_min_trust_tier not in ('bronze','silver','gold','diamond') then return jsonb_build_object('success', false, 'error', 'Invalid minimum trust tier'); end if;

            select * into v_profile from public.profiles where id = v_uid;
            if coalesce(v_profile.is_banned, false) then return jsonb_build_object('success', false, 'error', 'Account is suspended'); end if;

            select * into v_wallet from public.wallets where user_id = v_uid for update;
            if v_wallet is null then return jsonb_build_object('success', false, 'error', 'Wallet not found'); end if;
            if v_wallet.balance < p_prize_amount then
                return jsonb_build_object('success', false, 'error', 'Insufficient balance',
                                          'balance', v_wallet.balance, 'required', p_prize_amount);
            end if;

            insert into public.giveaways (host_id, title, description, prize_amount, game_type,
                game_duration_seconds, min_trust_tier, max_participants, status, scheduled_start_at,
                allow_sharing, number_of_winners, prevent_previous_winners_hours)
            values (v_uid, trim(p_title), p_description, p_prize_amount, p_game_type,
                p_duration_seconds, p_min_trust_tier, p_max_participants, 'scheduled', p_scheduled_start,
                p_allow_sharing, p_number_of_winners, p_prevent_previous_winners_hours)
            returning id into v_id;

            update public.wallets
            set balance = balance - p_prize_amount, escrow_balance = escrow_balance + p_prize_amount, updated_at = now()
            where id = v_wallet.id;

            insert into public.escrow (giveaway_id, host_id, amount, status)
            values (v_id, v_uid, p_prize_amount, 'held');

            insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, reference_id, description)
            values (v_wallet.id, v_uid, 'prize_escrow', p_prize_amount, 0, p_prize_amount,
                v_wallet.balance, v_wallet.balance - p_prize_amount, 'completed', 'giveaway', v_id,
                'Prize held for giveaway: ' || trim(p_title));

            return jsonb_build_object('success', true, 'giveaway_id', v_id, 'prize_amount', p_prize_amount);
        end;
        $$;

        create or replace function public.start_giveaway_event(p_giveaway_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_giveaway record; v_ends timestamptz;
        begin
            select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.host_id <> auth.uid() and not public.is_admin() then
                return jsonb_build_object('success', false, 'error', 'Only the host can start this event');
            end if;
            if v_giveaway.status <> 'scheduled' then return jsonb_build_object('success', false, 'error', 'Event is not in lobby state'); end if;

            v_ends := now() + (v_giveaway.game_duration_seconds || ' seconds')::interval + interval '5 seconds';
            update public.giveaways set status = 'live', starts_at = now(), ends_at = v_ends, updated_at = now()
            where id = p_giveaway_id;

            return jsonb_build_object('success', true, 'starts_at', now(), 'ends_at', v_ends);
        end;
        $$;

        -- All eligibility rules live here. They used to run in TypeScript before a plain INSERT,
        -- so calling PostgREST directly skipped every one — and min_trust_tier and
        -- max_participants were never enforced anywhere at all.
        create or replace function public.join_giveaway(p_giveaway_id uuid, p_fingerprint text default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_giveaway record; v_profile record;
                v_count integer; v_recent integer; v_device uuid;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select * into v_giveaway from public.giveaways where id = p_giveaway_id;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.status not in ('scheduled','live') then
                return jsonb_build_object('success', false, 'error', 'This giveaway is not accepting participants');
            end if;
            if v_giveaway.host_id = v_uid then
                return jsonb_build_object('success', false, 'error', 'Hosts cannot participate in their own giveaways');
            end if;

            select * into v_profile from public.profiles where id = v_uid;
            if coalesce(v_profile.is_banned, false) then return jsonb_build_object('success', false, 'error', 'Account is suspended'); end if;

            if exists (select 1 from public.giveaway_participants where giveaway_id = p_giveaway_id and user_id = v_uid) then
                return jsonb_build_object('success', true, 'already_joined', true);
            end if;

            if public.tier_rank(v_profile.trust_tier) < public.tier_rank(v_giveaway.min_trust_tier) then
                return jsonb_build_object('success', false,
                    'error', 'This giveaway requires ' || v_giveaway.min_trust_tier ||
                             ' tier or above. Your tier is ' || v_profile.trust_tier || '.');
            end if;

            if v_giveaway.max_participants is not null then
                select count(*) into v_count from public.combined_leaderboard where giveaway_id = p_giveaway_id;
                if v_count >= v_giveaway.max_participants then
                    return jsonb_build_object('success', false, 'error', 'This giveaway is full');
                end if;
            end if;

            if v_giveaway.prevent_previous_winners_hours > 0 then
                select count(*) into v_recent
                from public.giveaway_participants gp
                join public.giveaways g on g.id = gp.giveaway_id
                where gp.user_id = v_uid and gp.is_winner and g.host_id = v_giveaway.host_id
                  and gp.completed_at >= now() - (v_giveaway.prevent_previous_winners_hours || ' hours')::interval;

                if v_recent > 0 then
                    return jsonb_build_object('success', false,
                        'error', 'You recently won an event from this host. Please wait ' ||
                                 v_giveaway.prevent_previous_winners_hours || ' hours before joining their new events.');
                end if;
            end if;

            if p_fingerprint is not null then
                select id into v_device from public.device_fingerprints where fingerprint_hash = p_fingerprint;
            end if;

            insert into public.giveaway_participants (giveaway_id, user_id, device_fingerprint_id)
            values (p_giveaway_id, v_uid, v_device)
            on conflict (giveaway_id, user_id) do nothing;

            return jsonb_build_object('success', true);
        end;
        $$;

        -- Host or admin may end early; anyone else only once ends_at has actually passed. That
        -- keeps the client-side end-of-round fallback working while removing the "end it the
        -- moment I take the lead" attack.
        create or replace function public.complete_giveaway(p_giveaway_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_giveaway record; v_escrow record; v_winner record; v_count integer;
        begin
            select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.status = 'ended' then return jsonb_build_object('success', false, 'error', 'Giveaway already ended'); end if;
            if v_giveaway.status = 'cancelled' then return jsonb_build_object('success', false, 'error', 'Giveaway was cancelled'); end if;

            if v_giveaway.host_id <> auth.uid() and not public.is_admin()
               and (v_giveaway.ends_at is null or v_giveaway.ends_at > now()) then
                return jsonb_build_object('success', false, 'error', 'This giveaway has not finished yet');
            end if;

            select * into v_escrow from public.escrow where giveaway_id = p_giveaway_id and status = 'held' for update;
            if v_escrow is null then return jsonb_build_object('success', false, 'error', 'Escrow funds not found'); end if;

            select count(*) into v_count from public.combined_leaderboard
            where giveaway_id = p_giveaway_id and completed_at is not null;

            if v_count = 0 then
                update public.wallets
                set balance = balance + v_escrow.amount,
                    escrow_balance = greatest(0, escrow_balance - v_escrow.amount), updated_at = now()
                where user_id = v_giveaway.host_id;

                update public.escrow set status = 'refunded', released_at = now() where id = v_escrow.id;
                update public.giveaways set status = 'cancelled', ends_at = now(), updated_at = now() where id = p_giveaway_id;

                insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                    balance_before, balance_after, status, reference_type, reference_id, description)
                select w.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
                       w.balance - v_escrow.amount, w.balance, 'completed', 'giveaway', p_giveaway_id,
                       'Giveaway ended with no participants - escrow refunded'
                from public.wallets w where w.user_id = v_giveaway.host_id;

                return jsonb_build_object('success', true, 'status', 'cancelled',
                                          'reason', 'No participants', 'refunded', v_escrow.amount);
            end if;

            select * into v_winner from public.combined_leaderboard
            where giveaway_id = p_giveaway_id and completed_at is not null
            order by score desc, completed_at asc limit 1;

            update public.giveaways
            set status = 'ended', winner_id = v_winner.user_id,
                winner_guest_session_id = v_winner.guest_session_id,
                winning_score = v_winner.score,
                ends_at = least(coalesce(ends_at, now()), now()), updated_at = now()
            where id = p_giveaway_id;

            if v_winner.user_id is not null then
                update public.giveaway_participants set is_winner = true
                where giveaway_id = p_giveaway_id and user_id = v_winner.user_id;
                update public.profiles set total_wins = total_wins + 1, updated_at = now()
                where id = v_winner.user_id;
            else
                update public.guest_participants set is_winner = true where id = v_winner.participation_id;
            end if;

            return jsonb_build_object('success', true, 'status', 'ended',
                'winner_id', v_winner.user_id, 'winner_guest_session_id', v_winner.guest_session_id,
                'winner_username', v_winner.username, 'winning_score', v_winner.score,
                'prize_amount', v_escrow.amount, 'is_guest', v_winner.participant_type = 'guest');
        end;
        $$;

        create or replace function public.cancel_giveaway(p_giveaway_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_giveaway record; v_escrow record; v_wallet record; v_balance numeric;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.host_id <> v_uid and not public.is_admin() then
                return jsonb_build_object('success', false, 'error', 'Only the host can cancel this giveaway');
            end if;
            if v_giveaway.status in ('ended','cancelled') then
                return jsonb_build_object('success', false, 'error', 'This giveaway can no longer be cancelled');
            end if;
            if v_giveaway.status = 'live' and not public.is_admin() then
                return jsonb_build_object('success', false, 'error', 'Cannot cancel a giveaway that is already live');
            end if;

            select * into v_escrow from public.escrow where giveaway_id = p_giveaway_id and status = 'held' for update;

            if v_escrow is not null then
                select * into v_wallet from public.wallets where user_id = v_giveaway.host_id for update;
                if v_wallet is not null then
                    update public.wallets
                    set balance = balance + v_escrow.amount,
                        escrow_balance = greatest(0, escrow_balance - v_escrow.amount), updated_at = now()
                    where id = v_wallet.id returning balance into v_balance;

                    update public.escrow set status = 'refunded', released_at = now() where id = v_escrow.id;

                    insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                        balance_before, balance_after, status, reference_type, reference_id, description)
                    values (v_wallet.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
                        v_balance - v_escrow.amount, v_balance, 'completed', 'giveaway', p_giveaway_id,
                        'Giveaway cancelled - escrow refunded');
                end if;
            end if;

            update public.giveaways set status = 'cancelled', updated_at = now() where id = p_giveaway_id;

            if public.is_admin() and v_giveaway.host_id <> v_uid then
                perform public.log_admin_action('giveaway.cancel', 'giveaway', p_giveaway_id,
                                                coalesce(v_escrow.amount, 0), null,
                                                jsonb_build_object('host_id', v_giveaway.host_id));
            end if;

            return jsonb_build_object('success', true, 'refunded', coalesce(v_escrow.amount, 0));
        end;
        $$;

        -- Locks first, then checks. Locking after the checks leaves a window where two
        -- concurrent claims both pass the prize_claimed_at test.
        create or replace function public.claim_prize(p_giveaway_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_giveaway record; v_escrow record; v_wallet record; v_balance numeric;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

            select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
            if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
            if v_giveaway.status <> 'ended' then return jsonb_build_object('success', false, 'error', 'Giveaway has not ended'); end if;
            if v_giveaway.winner_id is distinct from v_uid then
                return jsonb_build_object('success', false, 'error', 'You are not the winner of this giveaway');
            end if;
            if v_giveaway.prize_claimed_at is not null then
                return jsonb_build_object('success', false, 'error', 'Prize already claimed');
            end if;

            select * into v_escrow from public.escrow where giveaway_id = p_giveaway_id and status = 'held' for update;
            if v_escrow is null then return jsonb_build_object('success', false, 'error', 'Prize funds unavailable'); end if;

            select * into v_wallet from public.wallets where user_id = v_uid for update;
            if v_wallet is null then
                insert into public.wallets (user_id) values (v_uid) returning * into v_wallet;
            end if;

            -- total_earned, not total_deposited: a prize is not a deposit, and counting it as one
            -- inflated the admin "total deposited" figure with internal transfers.
            update public.wallets
            set balance = balance + v_escrow.amount, total_earned = total_earned + v_escrow.amount, updated_at = now()
            where id = v_wallet.id returning balance into v_balance;

            update public.wallets
            set escrow_balance = greatest(0, escrow_balance - v_escrow.amount), updated_at = now()
            where user_id = v_giveaway.host_id;

            update public.escrow set status = 'released', released_to = v_uid, released_at = now() where id = v_escrow.id;
            update public.giveaways set prize_claimed_at = now(), updated_at = now() where id = p_giveaway_id;

            insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, reference_id, description)
            values (v_wallet.id, v_uid, 'prize_release', v_escrow.amount, 0, v_escrow.amount,
                v_balance - v_escrow.amount, v_balance, 'completed', 'giveaway', p_giveaway_id,
                'Prize claimed: ' || v_giveaway.title);

            update public.profiles
            set total_winnings = total_winnings + v_escrow.amount, updated_at = now() where id = v_uid;

            return jsonb_build_object('success', true, 'prize_amount', v_escrow.amount, 'claimed_at', now());
        end;
        $$;

        -- =============================================================================
        -- DEPOSITS AND WITHDRAWALS
        -- =============================================================================

        create or replace function public.request_deposit(p_amount numeric)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_uid uuid := auth.uid(); v_wallet record; v_fees jsonb := public.get_fee_schedule();
                v_ref text; v_tx uuid;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
            if p_amount is null or p_amount <= 0 then return jsonb_build_object('success', false, 'error', 'Invalid amount'); end if;
            if p_amount > (v_fees ->> 'max_deposit')::numeric then
                return jsonb_build_object('success', false, 'error', 'Deposit exceeds the maximum of ₦' || (v_fees ->> 'max_deposit'));
            end if;

            select * into v_wallet from public.wallets where user_id = v_uid for update;
            if v_wallet is null then return jsonb_build_object('success', false, 'error', 'Wallet not found'); end if;

            v_ref := 'DEP-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));

            update public.wallets set escrow_balance = escrow_balance + p_amount, updated_at = now() where id = v_wallet.id;

            insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, description, metadata)
            values (v_wallet.id, v_uid, 'deposit', p_amount, 0, p_amount,
                v_wallet.balance, v_wallet.balance, 'pending', 'manual_deposit',
                'Pending Deposit: ' || v_ref, jsonb_build_object('reference_code', v_ref))
            returning id into v_tx;

            return jsonb_build_object('success', true, 'reference_code', v_ref, 'amount', p_amount, 'transaction_id', v_tx);
        end;
        $$;

        -- Fee percentage and hold period are DERIVED, never accepted. They used to be RPC
        -- arguments, so anyone could call it with {p_fee_percentage: 0, p_hold_hours: 0}.
        create or replace function public.request_withdrawal(p_amount numeric, p_payout_details jsonb default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare
            v_uid uuid := auth.uid(); v_wallet record; v_profile record;
            v_fees jsonb := public.get_fee_schedule(); v_pct numeric; v_limit numeric;
            v_cooldown integer; v_last timestamptz; v_since numeric; v_fee numeric; v_net numeric; v_id uuid;
        begin
            if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
            if p_amount is null or p_amount <= 0 then return jsonb_build_object('success', false, 'error', 'Invalid amount'); end if;

            select * into v_profile from public.profiles where id = v_uid;
            if v_profile is null then return jsonb_build_object('success', false, 'error', 'Profile not found'); end if;
            if v_profile.is_banned then return jsonb_build_object('success', false, 'error', 'Account is suspended'); end if;

            select * into v_wallet from public.wallets where user_id = v_uid for update;
            if v_wallet is null then return jsonb_build_object('success', false, 'error', 'Wallet not found'); end if;

            v_pct      := (v_fees ->> 'withdrawal_fee_percent')::numeric;
            v_limit    := public.withdrawal_limit_for_tier(v_profile.trust_tier);
            v_cooldown := public.withdrawal_cooldown_hours(v_profile.trust_tier);

            if p_amount > (v_fees ->> 'max_withdrawal')::numeric then
                return jsonb_build_object('success', false, 'error', 'Withdrawal exceeds the platform maximum of ₦' || (v_fees ->> 'max_withdrawal'));
            end if;
            if p_amount > v_limit then
                return jsonb_build_object('success', false,
                    'error', 'Withdrawal exceeds your ' || v_profile.trust_tier || ' tier limit of ₦' || v_limit ||
                             '. Verify your identity to raise it.');
            end if;
            if v_wallet.balance < p_amount then return jsonb_build_object('success', false, 'error', 'Insufficient balance'); end if;

            select created_at into v_last from public.wallet_transactions
            where user_id = v_uid and type = 'withdrawal' and status in ('completed','pending')
            order by created_at desc limit 1;

            if v_last is not null then
                v_since := extract(epoch from (now() - v_last)) / 3600;
                if v_since < v_cooldown then
                    return jsonb_build_object('success', false,
                        'error', 'Withdrawal cooldown active. Please wait ' || ceil(v_cooldown - v_since) ||
                                 ' more hours (' || v_profile.trust_tier || ' tier).');
                end if;
            end if;

            v_fee := round(p_amount * (v_pct / 100), 2);
            v_net := p_amount - v_fee;

            update public.wallets set balance = balance - p_amount, updated_at = now() where id = v_wallet.id;

            insert into public.withdrawal_requests (user_id, wallet_id, amount, fee, net_amount,
                fee_percentage, payout_details, hold_until, status)
            values (v_uid, v_wallet.id, p_amount, v_fee, v_net, v_pct, p_payout_details,
                now() + (v_cooldown || ' hours')::interval, 'pending')
            returning id into v_id;

            insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, reference_id, description)
            values (v_wallet.id, v_uid, 'withdrawal', p_amount, v_fee, v_net,
                v_wallet.balance, v_wallet.balance - p_amount, 'pending', 'withdrawal', v_id,
                'Withdrawal request - ' || v_cooldown || 'h hold');

            return jsonb_build_object('success', true, 'withdrawal_id', v_id, 'amount', p_amount,
                'fee', v_fee, 'fee_percentage', v_pct, 'net_amount', v_net,
                'hold_until', now() + (v_cooldown || ' hours')::interval);
        end;
        $$;

        create or replace function public.approve_deposit(p_transaction_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_tx record; v_wallet record;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_tx from public.wallet_transactions
            where id = p_transaction_id and status = 'pending' and type = 'deposit' for update;
            if v_tx is null then return jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed'); end if;

            select * into v_wallet from public.wallets where id = v_tx.wallet_id for update;
            if v_wallet is null then return jsonb_build_object('success', false, 'error', 'Wallet not found'); end if;

            update public.wallets
            set escrow_balance = greatest(0, escrow_balance - v_tx.amount),
                balance = balance + v_tx.amount,
                total_deposited = total_deposited + v_tx.amount, updated_at = now()
            where id = v_tx.wallet_id;

            update public.wallet_transactions
            set status = 'completed', balance_before = v_wallet.balance,
                balance_after = v_wallet.balance + v_tx.amount, updated_at = now()
            where id = p_transaction_id;

            perform public.log_admin_action('deposit.approve', 'wallet_transaction', p_transaction_id,
                                            v_tx.amount, null, jsonb_build_object('user_id', v_tx.user_id));
            return jsonb_build_object('success', true);
        end;
        $$;

        create or replace function public.reject_deposit(p_transaction_id uuid, p_reason text default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_tx record;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_tx from public.wallet_transactions
            where id = p_transaction_id and status = 'pending' and type = 'deposit' for update;
            if v_tx is null then return jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed'); end if;

            update public.wallets set escrow_balance = greatest(0, escrow_balance - v_tx.amount), updated_at = now()
            where id = v_tx.wallet_id;
            update public.wallet_transactions set status = 'cancelled', updated_at = now() where id = p_transaction_id;

            perform public.log_admin_action('deposit.reject', 'wallet_transaction', p_transaction_id,
                                            v_tx.amount, p_reason, jsonb_build_object('user_id', v_tx.user_id));
            return jsonb_build_object('success', true);
        end;
        $$;

        create or replace function public.approve_withdrawal(p_withdrawal_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_w record;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_w from public.withdrawal_requests
            where id = p_withdrawal_id and status in ('pending','processing') for update;
            if v_w is null then return jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed'); end if;
            if v_w.hold_until > now() then return jsonb_build_object('success', false, 'error', 'Hold period has not expired yet'); end if;

            update public.withdrawal_requests set status = 'completed', processed_at = now() where id = p_withdrawal_id;
            update public.wallets set total_withdrawn = total_withdrawn + v_w.amount, updated_at = now() where id = v_w.wallet_id;
            update public.wallet_transactions set status = 'completed', updated_at = now()
            where reference_id = p_withdrawal_id and type = 'withdrawal';

            perform public.log_admin_action('withdrawal.approve', 'withdrawal_request', p_withdrawal_id,
                                            v_w.amount, null, jsonb_build_object('user_id', v_w.user_id));
            return jsonb_build_object('success', true, 'net_amount', v_w.net_amount, 'fee', v_w.fee);
        end;
        $$;

        create or replace function public.reject_withdrawal(p_withdrawal_id uuid, p_reason text default null)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_w record; v_balance numeric;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_w from public.withdrawal_requests
            where id = p_withdrawal_id and status in ('pending','processing') for update;
            if v_w is null then return jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed'); end if;

            update public.withdrawal_requests set status = 'cancelled', processed_at = now() where id = p_withdrawal_id;
            update public.wallets set balance = balance + v_w.amount, updated_at = now()
            where id = v_w.wallet_id returning balance into v_balance;

            update public.wallet_transactions
            set status = 'cancelled', description = 'Withdrawal rejected - refunded', updated_at = now()
            where reference_id = p_withdrawal_id and type = 'withdrawal';

            insert into public.wallet_transactions (wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, reference_id, description)
            values (v_w.wallet_id, v_w.user_id, 'prize_refund', v_w.amount, 0, v_w.amount,
                v_balance - v_w.amount, v_balance, 'completed', 'withdrawal_refund', p_withdrawal_id,
                coalesce('Withdrawal rejected: ' || p_reason, 'Withdrawal rejected - amount refunded'));

            perform public.log_admin_action('withdrawal.reject', 'withdrawal_request', p_withdrawal_id,
                                            v_w.amount, p_reason, jsonb_build_object('user_id', v_w.user_id));
            return jsonb_build_object('success', true, 'refunded', v_w.amount);
        end;
        $$;

        -- =============================================================================
        -- KYC
        -- =============================================================================

        create or replace function public.approve_kyc_request(p_request_id uuid)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_req record;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_req from public.kyc_requests where id = p_request_id for update;
            if not found then return jsonb_build_object('success', false, 'error', 'KYC request not found'); end if;
            if v_req.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'KYC request is not pending'); end if;

            update public.kyc_requests
            set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
            where id = p_request_id;

            -- trust_tier is not set by hand; the on_trust_score_change trigger derives it from
            -- trust_score. Setting both independently is what produced three disagreeing ladders.
            update public.profiles
            set id_verified = true, trust_score = greatest(trust_score, 80), updated_at = now()
            where id = v_req.user_id;

            insert into public.notifications (user_id, type, title, message, link)
            values (v_req.user_id, 'kyc', '✅ Identity Verified',
                    'Your KYC has been approved. Your withdrawal limits and cooldowns have been upgraded.', '/trust');

            perform public.log_admin_action('kyc.approve', 'kyc_request', p_request_id, null, null,
                                            jsonb_build_object('user_id', v_req.user_id));
            return jsonb_build_object('success', true);
        end;
        $$;

        create or replace function public.reject_kyc_request(p_request_id uuid, p_reason text)
        returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
        declare v_req record;
        begin
            if not public.is_admin_or_service() then return jsonb_build_object('success', false, 'error', 'Unauthorized'); end if;

            select * into v_req from public.kyc_requests where id = p_request_id for update;
            if not found then return jsonb_build_object('success', false, 'error', 'KYC request not found'); end if;
            if v_req.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'KYC request is not pending'); end if;

            update public.kyc_requests
            set status = 'rejected', rejection_reason = p_reason, reviewed_at = now(),
                reviewed_by = auth.uid(), updated_at = now()
            where id = p_request_id;

            insert into public.notifications (user_id, type, title, message, link)
            values (v_req.user_id, 'kyc', '❌ KYC Submission Rejected',
                    'Your KYC submission was rejected. Reason: ' || coalesce(p_reason, 'Documents unclear.') ||
                    '. Please resubmit with clearer documents.', '/trust/kyc');

            perform public.log_admin_action('kyc.reject', 'kyc_request', p_request_id, null, p_reason,
                                            jsonb_build_object('user_id', v_req.user_id));
            return jsonb_build_object('success', true);
        end;
        $$;

        commit;

        select 'Functions created. Run 00000000000003_security.sql next.' as result;
