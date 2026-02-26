-- Fix Permissions for Wallet Tables
-- Grant necessary access for PostgREST to the newly created wallet tables
-- RLS (Row Level Security) policies on these tables will handle user data isolation

GRANT ALL ON TABLE public.wallets TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.wallet_transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.withdrawal_requests TO anon, authenticated, service_role;

-- Grant EXECUTE permission on wallet RPCs to authenticated users
-- Grant EXECUTE permission on wallet RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.request_deposit(DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_giveaway_with_escrow(TEXT, TEXT, DECIMAL, TEXT, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

-- Grant EXECUTE permission on admin RPCs to service_role (and authenticated if admin logic uses it via RLS)
GRANT EXECUTE ON FUNCTION public.approve_deposit(UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_deposit(UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_giveaway(UUID) TO service_role, authenticated;
