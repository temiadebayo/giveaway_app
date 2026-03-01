-- =============================================
-- ENABLE REALTIME FOR LOBBY PARTICIPANTS
-- Run this in Supabase SQL Editor
-- =============================================

DO $$
BEGIN
  -- Add guest_participants to realtime if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'guest_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_participants;
  END IF;

  -- Add giveaway_participants to realtime if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'giveaway_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaway_participants;
  END IF;
END
$$;

SELECT 'Realtime enabled for Lobby Participants!' as result;
