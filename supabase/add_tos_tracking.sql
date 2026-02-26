-- =============================================
-- TERMS OF SERVICE COMPLIANCE TRACKING
-- Run this in Supabase SQL Editor
-- =============================================

-- Add accepted_tos column to profiles.
-- By defaulting to false, we force all existing users to re-accept 
-- the Terms of Service upon their next login.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS accepted_tos BOOLEAN DEFAULT false;

SELECT 'TOS tracking column added successfully' as result;
