-- =============================================
-- LOBBY SYSTEM MIGRATION
-- Adds lobby-based giveaway flow
-- =============================================

-- 1. Add allow_sharing column to giveaways
ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS allow_sharing BOOLEAN DEFAULT true;

-- 2. Add scheduled_start_at for auto-start countdown (separate from starts_at which is the actual start)
ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

-- 2.5 Add multiple winner support columns
ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS number_of_winners INTEGER DEFAULT 1 CHECK (number_of_winners >= 1);

ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS prevent_previous_winners_hours INTEGER DEFAULT 0 CHECK (prevent_previous_winners_hours >= 0);

-- 3. Update RLS on giveaway_participants to allow viewing during 'scheduled' (lobby)
DROP POLICY IF EXISTS "Users can view participants in their giveaways" ON public.giveaway_participants;
CREATE POLICY "Users can view participants in their giveaways" ON public.giveaway_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.giveaways 
            WHERE id = giveaway_id AND status IN ('scheduled', 'live', 'ended')
        )
    );

-- 4. Update create_giveaway_with_escrow to always create as 'scheduled' (lobby)
CREATE OR REPLACE FUNCTION public.create_giveaway_with_escrow(
    p_title TEXT,
    p_description TEXT,
    p_prize_amount DECIMAL,
    p_game_type TEXT DEFAULT 'tap',
    p_duration_seconds INTEGER DEFAULT 30,
    p_min_trust_tier TEXT DEFAULT 'bronze',
    p_max_participants INTEGER DEFAULT 1000,
    p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
    p_allow_sharing BOOLEAN DEFAULT true,
    p_number_of_winners INTEGER DEFAULT 1,
    p_prevent_previous_winners_hours INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_giveaway_id UUID;
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
    
    -- Create giveaway in 'scheduled' status (lobby open)
    -- starts_at and ends_at are set when host triggers START
    INSERT INTO public.giveaways (
        host_id, title, description, prize_amount, prize_currency,
        game_type, game_duration_seconds, min_trust_tier, max_participants,
        status, scheduled_start_at, allow_sharing,
        number_of_winners, prevent_previous_winners_hours
    )
    VALUES (
        auth.uid(), p_title, p_description, p_prize_amount, 'USD',
        p_game_type, p_duration_seconds, p_min_trust_tier, p_max_participants,
        'scheduled', p_scheduled_start, p_allow_sharing,
        p_number_of_winners, p_prevent_previous_winners_hours
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
        'prize_amount', p_prize_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create start_giveaway_event RPC
-- Host calls this to start the event. Sets status to 'live' and calculates end time.
CREATE OR REPLACE FUNCTION public.start_giveaway_event(p_giveaway_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_giveaway RECORD;
BEGIN
    -- Get giveaway
    SELECT * INTO v_giveaway
    FROM public.giveaways
    WHERE id = p_giveaway_id;
    
    IF v_giveaway IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
    END IF;
    
    -- Only the host can start
    IF v_giveaway.host_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only the host can start this event');
    END IF;
    
    -- Must be in scheduled status (lobby)
    IF v_giveaway.status != 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Event is not in lobby state');
    END IF;
    
    -- Set live, calculate actual start and end times
    UPDATE public.giveaways
    SET 
        status = 'live',
        starts_at = NOW(),
        ends_at = NOW() + (v_giveaway.game_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 seconds',
        updated_at = NOW()
    WHERE id = p_giveaway_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'starts_at', NOW(),
        'ends_at', NOW() + (v_giveaway.game_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 seconds'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Allow joining giveaways in 'scheduled' status
-- Update the join_giveaway check (if RPC exists) or rely on service-layer check
-- The giveaway_participants INSERT policy already allows users to manage own participation
