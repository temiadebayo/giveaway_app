-- =============================================
-- MANUAL DEPOSIT SYSTEM
-- =============================================

-- 1. Function to REQUEST a deposit
CREATE OR REPLACE FUNCTION public.request_deposit(p_amount DECIMAL)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_reference_code TEXT;
    v_transaction_id UUID;
BEGIN
    -- Get user's wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = auth.uid();
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;

    -- Generate Ref Code
    v_reference_code := 'DEP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

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


-- 2. Function to APPROVE a deposit (Admin Only via RLS or App Logic)
CREATE OR REPLACE FUNCTION public.approve_deposit(p_transaction_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_tx RECORD;
    v_wallet RECORD;
BEGIN
    -- Get pending transaction
    SELECT * INTO v_tx
    FROM public.wallet_transactions
    WHERE id = p_transaction_id AND status = 'pending' AND type = 'deposit';
    
    IF v_tx IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
    END IF;

    -- Get wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = v_tx.wallet_id;
    
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
    END IF;

    -- Update Wallet Balance
    UPDATE public.wallets
    SET 
        balance = balance + v_tx.amount,
        total_deposited = total_deposited + v_tx.amount,
        updated_at = NOW()
    WHERE id = v_tx.wallet_id;

    -- Update Transaction Status & Balances
    -- We record the balance snapshot at the time of approval
    UPDATE public.wallet_transactions
    SET 
        status = 'completed', 
        balance_before = v_wallet.balance,              -- Old balance
        balance_after = v_wallet.balance + v_tx.amount, -- New balance
        updated_at = NOW() -- Assuming updated_at exists, generic timestamp
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Function to REJECT a deposit
CREATE OR REPLACE FUNCTION public.reject_deposit(p_transaction_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.wallet_transactions
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_transaction_id AND status = 'pending' AND type = 'deposit';
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
