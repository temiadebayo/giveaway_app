    -- =============================================
    -- RECOVER STUCK GUEST PRIZE FUNDS
    -- Run this in Supabase SQL Editor to manually release a stuck escrow to a user who signed up.
    -- =============================================

    -- INSTRUCTIONS:
    -- Replace the values inside the single quotes below with the actual IDs from your database.
    -- 1. YOUR_GIVEAWAY_ID = The ID of the giveaway the guest won
    -- 2. THE_USER_ID = The new ID of the user who signed up

    DO $$
    DECLARE
        v_giveaway_id UUID := 'e5454d74-20e7-4f42-959f-25af3fbc53bf';   
        v_user_id UUID := 'e711d3ee-8f99-43d7-bff1-8d45a465a455';      
        
        v_giveaway RECORD;
        v_escrow RECORD;
        v_wallet RECORD;
    BEGIN
        -- 1. Find the giveaway
        SELECT * INTO v_giveaway FROM public.giveaways WHERE id = v_giveaway_id;
        IF v_giveaway IS NULL THEN RAISE EXCEPTION 'Giveaway not found'; END IF;
        
        -- 2. Find the stuck escrow
        SELECT * INTO v_escrow FROM public.escrow WHERE giveaway_id = v_giveaway_id AND status = 'held';
        IF v_escrow IS NULL THEN RAISE EXCEPTION 'Escrow not found or already released'; END IF;

        -- 3. Find or create the user's wallet
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id;
        IF v_wallet IS NULL THEN
            INSERT INTO public.wallets (user_id) VALUES (v_user_id) RETURNING * INTO v_wallet;
        END IF;

        -- 4. FORCE TRANSFER FUNDS TO THE NEW USER
        UPDATE public.wallets
        SET 
            balance = balance + v_escrow.amount,
            total_deposited = total_deposited + v_escrow.amount,
            updated_at = NOW()
        WHERE id = v_wallet.id;
        
        -- 5. Deduct from host's escrow tracking
        UPDATE public.wallets
        SET 
            escrow_balance = escrow_balance - v_escrow.amount,
            updated_at = NOW()
        WHERE user_id = v_giveaway.host_id;

        -- 6. Release escrow record
        UPDATE public.escrow
        SET status = 'released', released_to = v_user_id, released_at = NOW()
        WHERE id = v_escrow.id;

        -- 7. Fix the Giveaway Winner Mapping
        UPDATE public.giveaways
        SET winner_id = v_user_id, prize_claimed_at = NOW(), updated_at = NOW()
        WHERE id = v_giveaway_id;
        
        -- 8. Record the transaction in history
        INSERT INTO public.wallet_transactions (
            wallet_id, user_id, type, amount, fee, net_amount,
            balance_before, balance_after, reference_type, reference_id, description
        ) VALUES (
            v_wallet.id, v_user_id, 'prize_release', v_escrow.amount, 0, v_escrow.amount,
            v_wallet.balance - v_escrow.amount, v_wallet.balance, 'giveaway', v_giveaway_id,
            'Prize automatically recovered: ' || COALESCE(v_giveaway.title, 'Event')
        );

        -- 9. Fix profile win counts
        UPDATE public.profiles
        SET 
            total_winnings = total_winnings + v_escrow.amount,
            total_wins = GREATEST(1, total_wins + 1),
            updated_at = NOW()
        WHERE id = v_user_id;

        RAISE NOTICE 'SUCCESS: Transferred % NGN from escrow to user %', v_escrow.amount, v_user_id;
    END;
    $$;
