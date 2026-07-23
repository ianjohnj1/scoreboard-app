-- Fix storage RLS for avatars to support custom PIN-based auth
-- The previous hardening used auth.uid() which is always NULL for custom auth.

-- 1. Drop existing policies
DROP POLICY IF EXISTS "Allow individual uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow individual updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads for custom auth" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates for custom auth" ON storage.objects;

-- 2. Create new policies that don't require auth.uid(), but restrict by bucket and file type
CREATE POLICY "Allow uploads for custom auth" ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'avatars' 
    AND (LOWER(storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']))
);

CREATE POLICY "Allow updates for custom auth" ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'avatars' 
);
