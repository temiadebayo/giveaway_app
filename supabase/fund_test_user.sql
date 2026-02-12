-- =============================================
-- FUND TEST USER: temiadebayo1 with $2000
-- Run this in Supabase SQL Editor
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_wallet_id UUID;
BEGIN
    -- Find the user by username
    SELECT id INTO v_user_id 
    FROM public.profiles 
    WHERE username = 'temiadebayo1';
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User temiadebayo1 not found';
    END IF;
    
    -- Check if wallet exists
    SELECT id INTO v_wallet_id 
    FROM public.wallets 
    WHERE user_id = v_user_id;
    
    IF v_wallet_id IS NULL THEN
        -- Create wallet with $2000
        INSERT INTO public.wallets (user_id, balance, currency)
        VALUES (v_user_id, 2000, 'USD')
        RETURNING id INTO v_wallet_id;
        
        RAISE NOTICE 'Created wallet for temiadebayo1 with $2000';
    ELSE
        -- Update existing wallet
        UPDATE public.wallets 
        SET balance = balance + 2000,
            updated_at = NOW()
        WHERE id = v_wallet_id;
        
        RAISE NOTICE 'Added $2000 to existing wallet';
    END IF;
    
    -- Record the transaction
    INSERT INTO public.wallet_transactions (
        wallet_id,
        user_id,
        type,
        amount,
        fee,
        net_amount,
        balance_before,
        balance_after,
        description,
        status
    ) VALUES (
        v_wallet_id,
        v_user_id,
        'deposit',
        2000,
        0,
        2000,
        0,
        2000,
        'Test funding - Developer grant',
        'completed'
    );
    
    RAISE NOTICE 'Transaction recorded. User temiadebayo1 now has wallet funded!';
END $$;

-- Verify the result
SELECT 
    p.username,
    w.balance,
    w.currency
FROM public.profiles p
JOIN public.wallets w ON w.user_id = p.id
WHERE p.username = 'temiadebayo1';
