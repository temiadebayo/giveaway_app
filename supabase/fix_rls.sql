-- =============================================
-- FIX: Add missing RLS policies for profiles
-- Run this in Supabase SQL Editor
-- =============================================

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow anyone to view any profile (for leaderboards etc)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles
    FOR SELECT USING (true);

-- Done!
SELECT 'RLS policies updated!' as result;
