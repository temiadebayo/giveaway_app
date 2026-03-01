-- =============================================
-- PRIZE CLAIM SYSTEM
-- Adds manual prize claim functionality and guest winner support
-- =============================================

-- 1. Add columns to giveaways table
ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS winner_fingerprint_id TEXT,
ADD COLUMN IF NOT EXISTS prize_claimed_at TIMESTAMPTZ;

-- 2. Update complete_giveaway RPC
-- Now only picks winner and ends giveaway, does NOT release funds
CREATE OR REPLACE FUNCTION public.complete_giveaway(p_giveaway_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_giveaway RECORD;
    v_escrow RECORD;
    v_winner_data RECORD;
    v_participant_count INTEGER;
BEGIN
    -- Get giveaway
    SELECT * INTO v_giveaway
    FROM public.giveaways
    WHERE id = p_giveaway_id;
    
    IF v_giveaway IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
    END IF;
    
    IF v_giveaway.status = 'ended' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Giveaway already ended');
    END IF;
    
    -- Get escrow
    SELECT * INTO v_escrow
    FROM public.escrow
    WHERE giveaway_id = p_giveaway_id AND status = 'held';
    
    IF v_escrow IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Escrow funds not found');
    END IF;

    -- Count participants in combined leaderboard
    SELECT COUNT(*) INTO v_participant_count
    FROM public.combined_leaderboard
    WHERE giveaway_id = p_giveaway_id;
    
    -- 0 participants = cancel and refund
    IF v_participant_count = 0 THEN
        -- Refund to host
        UPDATE public.wallets
        SET 
            balance = balance + v_escrow.amount,
            escrow_balance = escrow_balance - v_escrow.amount,
            updated_at = NOW()
        WHERE user_id = v_giveaway.host_id;
        
        -- Update escrow
        UPDATE public.escrow
        SET status = 'refunded', released_at = NOW()
        WHERE id = v_escrow.id;
        
        -- Update giveaway
        UPDATE public.giveaways
        SET status = 'cancelled', ends_at = NOW(), updated_at = NOW()
        WHERE id = p_giveaway_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'status', 'cancelled',
            'reason', 'No participants',
            'refunded', v_escrow.amount
        );
    END IF;
    
    -- Get winner from combined leaderboard (highest score)
    -- This handles both authenticated users and guests
    SELECT *
    INTO v_winner_data
    FROM public.combined_leaderboard
    WHERE giveaway_id = p_giveaway_id
    ORDER BY score DESC, completed_at ASC
    LIMIT 1;
    
    -- Update giveaway with winner info but don't release funds yet
    UPDATE public.giveaways
    SET 
        status = 'ended', 
        winner_id = v_winner_data.user_id, -- NULL for unlinked guests
        winner_fingerprint_id = v_winner_data.fingerprint_id,
        winning_score = v_winner_data.score,
        ends_at = NOW(),
        updated_at = NOW()
    WHERE id = p_giveaway_id;
    
    -- If it's a real user, mark them as winner in participants table
    IF v_winner_data.user_id IS NOT NULL THEN
        UPDATE public.giveaway_participants
        SET is_winner = true
        WHERE giveaway_id = p_giveaway_id AND user_id = v_winner_data.user_id;
        
        -- Update winner's profile stats (counts as a win even if not yet claimed)
        UPDATE public.profiles
        SET total_wins = total_wins + 1, updated_at = NOW()
        WHERE id = v_winner_data.user_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'status', 'ended',
        'winner_id', v_winner_data.user_id,
        'winner_fingerprint_id', v_winner_data.fingerprint_id,
        'winner_username', v_winner_data.username,
        'winning_score', v_winner_data.score,
        'prize_amount', v_escrow.amount,
        'is_guest', v_winner_data.participant_type = 'guest'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Add claim_prize RPC
-- Allows winner to manually claim their prize
CREATE OR REPLACE FUNCTION public.claim_prize(p_giveaway_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_giveaway RECORD;
    v_escrow RECORD;
    v_user_id UUID;
    v_wallet RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Get giveaway
    SELECT * INTO v_giveaway
    FROM public.giveaways
    WHERE id = p_giveaway_id;
    
    IF v_giveaway IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
    END IF;
    
    -- Security checks
    IF v_giveaway.status != 'ended' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Giveaway has not ended');
    END IF;
    
    IF v_giveaway.winner_id IS DISTINCT FROM v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not the winner of this giveaway');
    END IF;
    
    IF v_giveaway.prize_claimed_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Prize already claimed');
    END IF;
    
    -- Get escrow
    SELECT * INTO v_escrow
    FROM public.escrow
    WHERE giveaway_id = p_giveaway_id AND status = 'held';
    
    IF v_escrow IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Prize funds unavailable');
    END IF;

    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id;
    
    IF v_wallet IS NULL THEN
        -- Create wallet if missing
        INSERT INTO public.wallets (user_id)
        VALUES (v_user_id)
        RETURNING * INTO v_wallet;
    END IF;
    
    -- 1. Transfer prize to winner's balance
    UPDATE public.wallets
    SET 
        balance = balance + v_escrow.amount,
        total_earned = total_earned + v_escrow.amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;
    
    -- 2. Deduct from host's escrow balance
    UPDATE public.wallets
    SET 
        escrow_balance = escrow_balance - v_escrow.amount,
        updated_at = NOW()
    WHERE user_id = v_giveaway.host_id;
    
    -- 3. Update escrow status
    UPDATE public.escrow
    SET 
        status = 'released', 
        released_to = v_user_id, 
        released_at = NOW()
    WHERE id = v_escrow.id;
    
    -- 4. Mark giveaway as claimed
    UPDATE public.giveaways
    SET 
        prize_claimed_at = NOW(), 
        updated_at = NOW()
    WHERE id = p_giveaway_id;
    
    -- 5. Record winner transaction
    INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, reference_type, reference_id,
        description
    )
    VALUES (
        v_wallet.id, v_user_id, 'prize_release', v_escrow.amount, 0, v_escrow.amount,
        v_wallet.balance - v_escrow.amount, v_wallet.balance, 'giveaway', p_giveaway_id,
        'Prize claimed: ' || v_giveaway.title
    );
    
    -- 6. Update winner profile earnings stat
    UPDATE public.profiles
    SET 
        total_winnings = total_winnings + v_escrow.amount,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'prize_amount', v_escrow.amount,
        'claimed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
