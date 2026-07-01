-- Add avatar_url and catchphrase to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS catchphrase TEXT;

-- Create avatars storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'avatars', 'avatars', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'avatars'
);

-- Storage Policies for avatars
-- Allow public read access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Allow individual uploads"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'avatars' 
    AND (auth.uid()::text = (storage.foldername(name))[1] OR auth.role() = 'anon')
);

-- Allow users to update their own avatars
CREATE POLICY "Allow individual updates"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR auth.role() = 'anon')
);
