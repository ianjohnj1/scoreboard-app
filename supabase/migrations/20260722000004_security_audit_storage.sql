-- Priority 2: Storage Validation (Avatars)

DROP POLICY IF EXISTS "Allow uploads for custom auth" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates for custom auth" ON storage.objects;

-- Require file size < 5MB and path to match current user's profile ID
-- (Note: Relies on Supabase Storage API forwarding custom headers for get_current_session_profile_id to work)
CREATE POLICY "Allow secure uploads for custom auth" ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = get_current_session_profile_id()::text
    AND (LOWER(storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']))
    -- Enforce 5MB limit
    -- Note: metadata might not be fully populated on insert policy check in some older Supabase versions, 
    -- but modern Supabase allows checking metadata->>'size'.
    AND COALESCE((metadata->>'size')::int, 0) < 5242880
);

CREATE POLICY "Allow secure updates for custom auth" ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = get_current_session_profile_id()::text
)
WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = get_current_session_profile_id()::text
    AND (LOWER(storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']))
    AND COALESCE((metadata->>'size')::int, 0) < 5242880
);

CREATE POLICY "Allow secure delete for custom auth" ON storage.objects FOR DELETE 
USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = get_current_session_profile_id()::text
);
