-- =============================================
-- ADD BANK COLUMNS TO PROFILES
-- Run this in Supabase SQL Editor
-- =============================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_name TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Bank details columns added successfully!' as result;
