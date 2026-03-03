-- =============================================
-- GIVEAWAY APP - WALLET SYSTEM SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. WALLETS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    balance DECIMAL(12,2) DEFAULT 0 CHECK (balance >= 0),
    escrow_balance DECIMAL(12,2) DEFAULT 0 CHECK (escrow_balance >= 0),  -- Funds held for active giveaways
    total_earned DECIMAL(12,2) DEFAULT 0,
    total_withdrawn DECIMAL(12,2) DEFAULT 0,
    total_deposited DECIMAL(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
CREATE POLICY "Users can view own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;
CREATE POLICY "Users can update own wallet" ON public.wallets
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- 2. WALLET TRANSACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'deposit',           -- Adding funds
        'withdrawal',        -- Cashing out
        'withdrawal_fee',    -- Platform fee on withdrawal
        'prize_escrow',      -- Host funds held for giveaway
        'prize_release',     -- Prize given to winner
        'prize_refund',      -- Prize returned (cancelled giveaway)
        'entry_fee',         -- Participant entry fee
        'platform_fee'       -- Platform cut
    )),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,  -- Amount after fees
    balance_before DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    reference_type TEXT,  -- 'giveaway', 'withdrawal', etc.
    reference_id UUID,    -- ID of related entity
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);

-- =============================================
-- 3. WITHDRAWAL REQUESTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    fee DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,  -- Amount after fee
    fee_percentage DECIMAL(5,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    payout_method TEXT,  -- 'bank_transfer', 'paypal', etc.
    payout_details JSONB,  -- Account info (encrypted)
    hold_until TIMESTAMPTZ,  -- Anti-fraud hold period
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users can create withdrawals" ON public.withdrawal_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 4. ESCROW TABLE (For giveaway prizes)
-- =============================================
CREATE TABLE IF NOT EXISTS public.escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    giveaway_id UUID REFERENCES public.giveaways(id) ON DELETE CASCADE UNIQUE,
    host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
    released_to UUID REFERENCES public.profiles(id),  -- Winner
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.escrow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own escrow" ON public.escrow;
CREATE POLICY "Users can view own escrow" ON public.escrow
    FOR SELECT USING (auth.uid() = host_id OR auth.uid() = released_to);

-- =============================================
-- 5. FUNCTION: Create wallet on user signup
-- =============================================
CREATE OR REPLACE FUNCTION public.create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new profiles
DROP TRIGGER IF EXISTS on_profile_created_create_wallet ON public.profiles;
CREATE TRIGGER on_profile_created_create_wallet
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_user();

-- =============================================
-- 6. FUNCTION: Process withdrawal request
-- =============================================
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_amount DECIMAL,
    p_fee_percentage DECIMAL DEFAULT 3.0,
    p_hold_hours INTEGER DEFAULT 48
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_fee DECIMAL;
    v_net_amount DECIMAL;
    v_withdrawal_id UUID;
BEGIN
    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = auth.uid();
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    -- Check balance
    IF v_wallet.balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
    
    -- Calculate fee
    v_fee := ROUND(p_amount * (p_fee_percentage / 100), 2);
    v_net_amount := p_amount - v_fee;
    
    -- Deduct from wallet
    UPDATE public.wallets
    SET 
        balance = balance - p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;
    
    -- Create withdrawal request
    INSERT INTO public.withdrawal_requests (
        user_id, wallet_id, amount, fee, net_amount, fee_percentage, 
        hold_until, status
    )
    VALUES (
        auth.uid(), v_wallet.id, p_amount, v_fee, v_net_amount, p_fee_percentage,
        NOW() + (p_hold_hours || ' hours')::INTERVAL, 'pending'
    )
    RETURNING id INTO v_withdrawal_id;
    
    -- Record transaction
    INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, reference_type, reference_id,
        description
    )
    VALUES (
        v_wallet.id, auth.uid(), 'withdrawal', p_amount, v_fee, v_net_amount,
        v_wallet.balance, v_wallet.balance - p_amount, 'withdrawal', v_withdrawal_id,
        'Withdrawal request - ' || v_hold_hours || 'h hold'
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'withdrawal_id', v_withdrawal_id,
        'amount', p_amount,
        'fee', v_fee,
        'net_amount', v_net_amount,
        'hold_until', NOW() + (p_hold_hours || ' hours')::INTERVAL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. FUNCTION: Create giveaway with escrow
-- =============================================
CREATE OR REPLACE FUNCTION public.create_giveaway_with_escrow(
    p_title TEXT,
    p_description TEXT,
    p_prize_amount DECIMAL,
    p_game_type TEXT DEFAULT 'tap',
    p_duration_seconds INTEGER DEFAULT 30,
    p_min_trust_tier TEXT DEFAULT 'bronze',
    p_max_participants INTEGER DEFAULT 1000,
    p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
    p_number_of_winners INTEGER DEFAULT 1,
    p_prevent_previous_winners_hours INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_giveaway_id UUID;
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
BEGIN
    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = auth.uid();
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    -- Check balance
    IF v_wallet.balance < p_prize_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Insufficient balance',
            'balance', v_wallet.balance,
            'required', p_prize_amount
        );
    END IF;
    
    -- Calculate times
    v_start_time := COALESCE(p_scheduled_start, NOW());
    v_end_time := v_start_time + (p_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 minutes';  -- 5 min grace
    
    -- Create giveaway
    INSERT INTO public.giveaways (
        host_id, title, description, prize_amount, prize_currency,
        game_type, game_duration_seconds, min_trust_tier, max_participants,
        number_of_winners, prevent_previous_winners_hours,
        status, starts_at, ends_at
    )
    VALUES (
        auth.uid(), p_title, p_description, p_prize_amount, 'NGN',
        p_game_type, p_duration_seconds, p_min_trust_tier, p_max_participants,
        p_number_of_winners, p_prevent_previous_winners_hours,
        CASE WHEN p_scheduled_start IS NULL THEN 'live' ELSE 'scheduled' END,
        v_start_time, v_end_time
    )
    RETURNING id INTO v_giveaway_id;
    
    -- Deduct from wallet and add to escrow
    UPDATE public.wallets
    SET 
        balance = balance - p_prize_amount,
        escrow_balance = escrow_balance + p_prize_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;
    
    -- Create escrow record
    INSERT INTO public.escrow (giveaway_id, host_id, amount, status)
    VALUES (v_giveaway_id, auth.uid(), p_prize_amount, 'held');
    
    -- Record transaction
    INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, reference_type, reference_id,
        description
    )
    VALUES (
        v_wallet.id, auth.uid(), 'prize_escrow', p_prize_amount, 0, p_prize_amount,
        v_wallet.balance, v_wallet.balance - p_prize_amount, 'giveaway', v_giveaway_id,
        'Prize held for giveaway: ' || p_title
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'giveaway_id', v_giveaway_id,
        'prize_amount', p_prize_amount,
        'starts_at', v_start_time,
        'ends_at', v_end_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 8. FUNCTION: Complete giveaway and pay winner
-- =============================================
CREATE OR REPLACE FUNCTION public.complete_giveaway(p_giveaway_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_giveaway RECORD;
    v_escrow RECORD;
    v_participant_count INTEGER;
    v_winners RECORD;  -- Cursor/iterator for loops
    v_winner_count INTEGER := 0;
    v_individual_prize DECIMAL(12,2);
    v_winner_list JSONB := '[]'::JSONB;
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
    
    -- Count participants
    SELECT COUNT(*) INTO v_participant_count
    FROM public.giveaway_participants
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
        
        -- Record refund transaction
        INSERT INTO public.wallet_transactions (
            wallet_id, user_id, type, amount, fee, net_amount,
            balance_before, balance_after, reference_type, reference_id,
            description
        )
        SELECT 
            w.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
            w.balance - v_escrow.amount, w.balance, 'giveaway', p_giveaway_id,
            'Giveaway cancelled - no participants'
        FROM public.wallets w WHERE w.user_id = v_giveaway.host_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'status', 'cancelled',
            'reason', 'No participants',
            'refunded', v_escrow.amount
        );
    END IF;
    
    -- Find actual number of winners to reward (capped by participant count and requested number)
    SELECT COUNT(*) INTO v_winner_count FROM (
        SELECT id FROM public.giveaway_participants
        WHERE giveaway_id = p_giveaway_id
        ORDER BY score DESC, completed_at ASC
        LIMIT v_giveaway.number_of_winners
    ) AS win_query;

    v_individual_prize := ROUND(v_escrow.amount / GREATEST(v_winner_count, 1), 2);

    -- Loop through the winners and distribute individual prizes
    FOR v_winners IN 
        SELECT p.*, pr.username, pr.display_name
        FROM public.giveaway_participants p
        JOIN public.profiles pr ON p.user_id = pr.id
        WHERE p.giveaway_id = p_giveaway_id
        ORDER BY p.score DESC, p.completed_at ASC
        LIMIT v_giveaway.number_of_winners
    LOOP
        -- Ensure winner has a wallet
        INSERT INTO public.wallets (user_id)
        VALUES (v_winners.user_id)
        ON CONFLICT (user_id) DO NOTHING;

        -- Transfer individual prize to winner
        UPDATE public.wallets
        SET 
            balance = balance + v_individual_prize,
            total_earned = total_earned + v_individual_prize,
            updated_at = NOW()
        WHERE user_id = v_winners.user_id;

        -- Record individual winner transaction
        INSERT INTO public.wallet_transactions (
            wallet_id, user_id, type, amount, fee, net_amount,
            balance_before, balance_after, reference_type, reference_id,
            description
        )
        SELECT 
            w.id, v_winners.user_id, 'prize_release', v_individual_prize, 0, v_individual_prize,
            w.balance - v_individual_prize, w.balance, 'giveaway', p_giveaway_id,
            'Prize won: ' || v_giveaway.title
        FROM public.wallets w WHERE w.user_id = v_winners.user_id;

        -- Update winner's profile stats
        UPDATE public.profiles
        SET 
            total_wins = total_wins + 1,
            total_winnings = total_winnings + v_individual_prize,
            updated_at = NOW()
        WHERE id = v_winners.user_id;

        -- Notify the winner
        INSERT INTO public.notifications (user_id, type, title, message, link, payload)
        VALUES (
            v_winners.user_id, 'win',
            '🎉 You Won!',
            'You won ₦' || v_individual_prize || ' in "' || v_giveaway.title || '"! Claim your prize.',
            '/wallet',
            jsonb_build_object('giveaway_id', p_giveaway_id, 'amount', v_individual_prize)
        );

        -- Build winner list JSON array for return
        v_winner_list := v_winner_list || jsonb_build_object(
            'user_id', v_winners.user_id,
            'username', v_winners.username,
            'score', v_winners.score,
            'prize', v_individual_prize
        );
    END LOOP;
    
    -- Mark all chosen top ranks as winners
    UPDATE public.giveaway_participants
    SET is_winner = true
    WHERE giveaway_id = p_giveaway_id AND user_id IN (
        SELECT user_id FROM public.giveaway_participants
        WHERE giveaway_id = p_giveaway_id
        ORDER BY score DESC, completed_at ASC
        LIMIT v_giveaway.number_of_winners
    );

    -- Reduce host's escrow balance by full amount
    UPDATE public.wallets
    SET 
        escrow_balance = escrow_balance - v_escrow.amount,
        updated_at = NOW()
    WHERE user_id = v_giveaway.host_id;
    
    -- Update escrow
    UPDATE public.escrow
    SET status = 'released', released_at = NOW()
    WHERE id = v_escrow.id;
    
    -- Escrow `released_to` historically stored 1 winner, skip this or keep null for multi-winner

    -- Update giveaway (Set primary winner_id as the 1st place for legacy UI compatibility)
    UPDATE public.giveaways
    SET 
        status = 'ended', 
        winner_id = (v_winner_list->0->>'user_id')::UUID,
        winning_score = (v_winner_list->0->>'score')::INTEGER,
        ends_at = NOW(),
        updated_at = NOW()
    WHERE id = p_giveaway_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'status', 'ended',
        'winners', v_winner_list,
        'total_prize_amount', v_escrow.amount,
        'participant_count', v_participant_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Done!
-- =============================================
SELECT 'Wallet system schema created!' as result;
