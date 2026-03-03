-- =============================================
-- Add notification_preferences and privacy_settings JSONB columns
-- Run this in Supabase SQL Editor
-- =============================================

-- Add columns if they don't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "winning_alerts": true,
    "new_giveaway_tier": true,
    "host_live": true,
    "trust_updates": false,
    "email_digest": false
}'::jsonb;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{
    "hide_wins": false,
    "anonymous_leaderboard": false,
    "public_profile": true
}'::jsonb;

SELECT 'Settings columns added!' AS result;
