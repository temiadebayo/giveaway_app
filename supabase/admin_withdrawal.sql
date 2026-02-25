-- =============================================
-- ADMIN WITHDRAWAL PROCESSING
-- =============================================

-- 1. APPROVE a withdrawal (Admin marks as processed/completed)
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_withdrawal_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_withdrawal RECORD;
BEGIN
    -- Get pending withdrawal
    SELECT * INTO v_withdrawal
    FROM public.withdrawal_requests
    WHERE id = p_withdrawal_id AND status = 'pending';
    
    IF v_withdrawal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
    END IF;

    -- Check hold period
    IF v_withdrawal.hold_until > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hold period has not expired yet');
    END IF;

    -- Update withdrawal status to completed
    UPDATE public.withdrawal_requests
    SET 
        status = 'completed',
        processed_at = NOW()
    WHERE id = p_withdrawal_id;

    -- Update wallet totals
    UPDATE public.wallets
    SET 
        total_withdrawn = total_withdrawn + v_withdrawal.amount,
        updated_at = NOW()
    WHERE id = v_withdrawal.wallet_id;

    -- Update the corresponding transaction status
    UPDATE public.wallet_transactions
    SET 
        status = 'completed',
        updated_at = NOW()
    WHERE reference_id = p_withdrawal_id::TEXT AND type = 'withdrawal';

    RETURN jsonb_build_object(
        'success', true,
        'net_amount', v_withdrawal.net_amount,
        'fee', v_withdrawal.fee
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. REJECT a withdrawal (Admin rejects, refund balance)
CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_withdrawal_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_withdrawal RECORD;
BEGIN
    -- Get pending withdrawal
    SELECT * INTO v_withdrawal
    FROM public.withdrawal_requests
    WHERE id = p_withdrawal_id AND status = 'pending';
    
    IF v_withdrawal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
    END IF;

    -- Update withdrawal status to cancelled
    UPDATE public.withdrawal_requests
    SET 
        status = 'cancelled',
        processed_at = NOW()
    WHERE id = p_withdrawal_id;

    -- Refund the full amount (including fee) back to wallet
    UPDATE public.wallets
    SET 
        balance = balance + v_withdrawal.amount,
        updated_at = NOW()
    WHERE id = v_withdrawal.wallet_id;

    -- Update the corresponding transaction status
    UPDATE public.wallet_transactions
    SET 
        status = 'cancelled',
        description = 'Withdrawal rejected - refunded',
        updated_at = NOW()
    WHERE reference_id = p_withdrawal_id::TEXT AND type = 'withdrawal';

    -- Record refund transaction
    INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, fee, net_amount,
        balance_before, balance_after, reference_type, reference_id,
        description
    )
    SELECT
        w.id, v_withdrawal.user_id, 'deposit', v_withdrawal.amount, 0, v_withdrawal.amount,
        w.balance - v_withdrawal.amount, w.balance, 'withdrawal_refund', p_withdrawal_id::TEXT,
        'Withdrawal rejected - amount refunded'
    FROM public.wallets w WHERE w.id = v_withdrawal.wallet_id;

    RETURN jsonb_build_object(
        'success', true,
        'refunded', v_withdrawal.amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
