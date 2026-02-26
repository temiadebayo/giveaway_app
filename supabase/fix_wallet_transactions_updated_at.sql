-- =============================================
-- FIX MISSING COLUMN IN WALLET TRANSACTIONS
-- Run this in Supabase SQL Editor to resolve the Admin 500 Application Error 
-- when Approving / Rejecting deposits and withdrawals.
-- =============================================

-- Add the missing updated_at column to the wallet_transactions table
ALTER TABLE public.wallet_transactions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

SELECT 'Successfully added updated_at to wallet_transactions!' as result;
