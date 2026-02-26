-- =============================================
-- FIX: APPLY TRANSFER LIMITS & TIERED COOLDOWNS
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Modified Deposit RPC with 5,000,000 Limit
CREATE OR REPLACE FUNCTION public.request_deposit(p_amount DECIMAL)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_reference_code TEXT;
    v_transaction_id UUID;
BEGIN
    -- FPS Limit: Maximum deposit is 5,000,000 NGN
    IF p_amount > 5000000 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Deposit amount exceeds the maximum limit of ₦5,000,000'
        );
    END IF;

    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = auth.uid();
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;

    -- Generate Ref Code
    v_reference_code := 'DEP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

    -- Stage the funds in Escrow immediately
    UPDATE public.wallets
    SET 
        escrow_balance = escrow_balance + p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Insert Pending Transaction
    INSERT INTO public.wallet_transactions (
        wallet_id, 
        user_id, 
        type, 
        amount, 
        fee, 
        net_amount, 
        balance_before, 
        balance_after, 
        status, 
        reference_type,
        description,
        metadata
    )
    VALUES (
        v_wallet.id,
        auth.uid(),
        'deposit',
        p_amount,
        0,
        p_amount,
        v_wallet.balance,   -- Balance BEFORE is current balance
        v_wallet.balance,   -- Balance AFTER is ALSO current balance (until approved)
        'pending',
        'manual_deposit',
        'Pending Deposit: ' || v_reference_code,
        jsonb_build_object('reference_code', v_reference_code)
    )
    RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'reference_code', v_reference_code,
        'amount', p_amount,
        'transaction_id', v_transaction_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Modified Withdrawal RPC with 500,000 Limit and Tiered Cooldowns
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_amount DECIMAL,
    p_fee_percentage DECIMAL DEFAULT 3.0,
    p_hold_hours INTEGER DEFAULT 48
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_profile RECORD;
    v_fee DECIMAL;
    v_net_amount DECIMAL;
    v_withdrawal_id UUID;
    v_last_withdrawal_time TIMESTAMPTZ;
    v_cooldown_hours INTEGER;
    v_hours_since_last_withdrawal DECIMAL;
    v_wait_hours_remaining INTEGER;
BEGIN
    -- FPS Limit: Maximum withdrawal is 500,000 NGN
    IF p_amount > 500000 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Withdrawal amount exceeds the maximum limit of ₦500,000'
        );
    END IF;

    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = auth.uid();
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;

    -- Get user's profile to check trust_tier
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = auth.uid();

    -- Determine user's specific cooldown requirement based on trust_tier
    IF v_profile.trust_tier = 'diamond' THEN
        v_cooldown_hours := 6;
    ELSIF v_profile.trust_tier = 'gold' THEN
        v_cooldown_hours := 24;
    ELSE
        -- bronze and silver default to 48 hours
        v_cooldown_hours := 48;
    END IF;

    -- Check for the last successful or pending withdrawal
    SELECT created_at INTO v_last_withdrawal_time
    FROM public.wallet_transactions
    WHERE user_id = auth.uid() 
      AND type = 'withdrawal' 
      AND status IN ('completed', 'pending')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Evaluate Cooldown Enforcement
    IF v_last_withdrawal_time IS NOT NULL THEN
        -- Calculate how many hours have passed since their last withdrawal
        v_hours_since_last_withdrawal := EXTRACT(EPOCH FROM (NOW() - v_last_withdrawal_time)) / 3600;

        IF v_hours_since_last_withdrawal < v_cooldown_hours THEN
            v_wait_hours_remaining := CEIL(v_cooldown_hours - v_hours_since_last_withdrawal);
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Withdrawal cooldown active. Please wait ' || v_wait_hours_remaining || ' more hours before withdrawing again based on your ' || v_profile.trust_tier || ' tier status.'
            );
        END IF;
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
        'Withdrawal request - ' || p_hold_hours || 'h hold'
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

-- Done!
SELECT 'Deposit/Withdrawal Limit RPCs updated successfully!' as result;
