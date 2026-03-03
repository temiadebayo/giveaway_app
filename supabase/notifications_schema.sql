-- =============================================
-- NOTIFICATIONS SYSTEM SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('win','kyc','trust','giveaway_live','deposit','system')),
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    link        TEXT,
    payload     JSONB DEFAULT '{}',
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow system/triggers to insert (SECURITY DEFINER functions handle this)
DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY "System insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (true);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
    ON public.notifications(user_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notif_user_created
    ON public.notifications(user_id, created_at DESC);

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 5. Helper RPC: mark all as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = auth.uid() AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;

SELECT 'Notifications system ready!' AS result;
