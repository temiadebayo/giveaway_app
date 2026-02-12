-- =============================================
-- FIX: Allow hosts to see their own giveaways (including drafts)
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Anyone can view active giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Hosts can view own giveaways" ON public.giveaways;

-- Allow viewing active/ended giveaways OR own giveaways (including drafts)
CREATE POLICY "View giveaways" ON public.giveaways
    FOR SELECT USING (
        status IN ('scheduled', 'live', 'ended') 
        OR auth.uid() = host_id
    );

-- Allow hosts to insert giveaways
DROP POLICY IF EXISTS "Hosts can insert giveaways" ON public.giveaways;
CREATE POLICY "Hosts can insert giveaways" ON public.giveaways
    FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Allow hosts to update their own giveaways
DROP POLICY IF EXISTS "Hosts can update own giveaways" ON public.giveaways;
CREATE POLICY "Hosts can update own giveaways" ON public.giveaways
    FOR UPDATE USING (auth.uid() = host_id);

-- Allow hosts to delete their own giveaways
DROP POLICY IF EXISTS "Hosts can delete own giveaways" ON public.giveaways;
CREATE POLICY "Hosts can delete own giveaways" ON public.giveaways
    FOR DELETE USING (auth.uid() = host_id);

-- Done!
SELECT 'Giveaway RLS policies fixed!' as result;
