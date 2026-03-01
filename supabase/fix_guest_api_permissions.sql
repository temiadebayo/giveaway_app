-- =============================================
-- GRANT SERVICE ROLE PERMISSIONS FOR GUEST API
-- Run this in Supabase SQL Editor
-- =============================================

-- Ensure the service_role (which our API route uses) has full access to the tables
GRANT ALL ON public.guest_participants TO service_role;
GRANT ALL ON public.giveaways TO service_role;
GRANT ALL ON public.giveaway_participants TO service_role;

-- Also ensure anon and authenticated can insert
GRANT INSERT ON public.guest_participants TO anon, authenticated;

SELECT 'Permissions granted successfully to service_role and anon/authenticated' as result;
