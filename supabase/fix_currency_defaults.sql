-- =============================================
-- FIX: SET DEFAULT CURRENCY TO NGN
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Alter Table Defaults to NGN
ALTER TABLE public.wallets ALTER COLUMN currency SET DEFAULT 'NGN';
ALTER TABLE public.giveaways ALTER COLUMN prize_currency SET DEFAULT 'NGN';

-- 2. Backfill existing rows to NGN
UPDATE public.wallets SET currency = 'NGN' WHERE currency = 'USD';
UPDATE public.giveaways SET prize_currency = 'NGN' WHERE prize_currency = 'USD';

-- Done!
SELECT 'Database currency defaults updated to NGN and existing rows backfilled!' as result;
