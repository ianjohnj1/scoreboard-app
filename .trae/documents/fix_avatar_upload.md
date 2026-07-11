# Plan: Fix Avatar Uploads

## Summary
The avatar upload feature currently fails because the Supabase Storage Row Level Security (RLS) policies were hardened to require a valid Supabase `auth.uid()`. Since the application uses a custom PIN-based authentication system, `auth.uid()` is always null, causing all uploads to be rejected by the database. 

Additionally, we will ensure the file input is correctly configured so mobile devices present the choice to either take a selfie or select an existing photo from the gallery.

## Current State Analysis
- **File**: `supabase/migrations/20260701_security_hardening.sql` enforces `auth.uid()::text = (storage.foldername(name))[1]` on the `avatars` bucket.
- **File**: `src/pages/ProfilePage.tsx` uses `<input type="file" accept="image/*">`, which triggers an upload to Supabase Storage but receives a "new row violates row-level security policy" error.

## Proposed Changes

### 1. Fix Storage RLS Policy for Custom Auth
- **File**: `supabase/migrations/20260711_fix_avatars_storage_rls.sql` (New Migration)
- **What/How**: 
  - Create a new migration script to drop the strict `auth.uid()` policies on `storage.objects` for the `avatars` bucket.
  - Re-create the `INSERT` and `UPDATE` policies using `USING (true)` and `WITH CHECK (true)` but keeping the bucket restriction (`bucket_id = 'avatars'`) and the file extension restriction (`LOWER(storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp'])`).
  - Run the migration against the local Supabase instance using `npx supabase db push` or `npx supabase migration up` (or via the web-dev tool `supabase_apply_migration` if applicable).

### 2. Verify File Input for Mobile Devices
- **File**: `src/pages/ProfilePage.tsx`
- **What/How**:
  - The existing `<input type="file" accept="image/*" />` natively supports both "Take Photo" and "Photo Library" on iOS and Android. 
  - We will keep this structure as it is the standard way to offer both options. (Adding `capture="user"` would strictly force the camera and disable the gallery option).
  - Add an error alert specific to upload failures so users know if a network or size issue occurs.

## Verification
1. Apply the new database migration to update the Storage RLS policies.
2. Log into the app with a test PIN account.
3. Navigate to the profile settings and upload an avatar.
4. Verify the upload succeeds and the avatar image URL is saved to the profile.