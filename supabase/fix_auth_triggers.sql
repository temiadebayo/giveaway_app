-- =============================================
-- FIX: HARDEN AUTH TRIGGER
-- Run this in Supabase SQL Editor
-- =============================================

-- Safely handle new user creation without throwing exceptions on null emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    final_username TEXT;
    final_display_name TEXT;
BEGIN
    -- Safely derive a username without calling split_part on a null email
    final_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        CASE WHEN NEW.email IS NOT NULL THEN split_part(NEW.email, '@', 1) ELSE NULL END,
        'user_' || substr(NEW.id::text, 1, 8)
    );

    final_display_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        final_username
    );

    INSERT INTO public.profiles (id, email, username, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        final_username,
        final_display_name,
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- If something completely unexpected happens, insert the bare minimum
        -- so the foreign key constraints in wallet creation don't break the whole app
        INSERT INTO public.profiles (id, username, display_name)
        VALUES (NEW.id, 'user_' || substr(NEW.id::text, 1, 8), 'User');
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done!
SELECT 'Auth trigger successfully hardened!' as result;
