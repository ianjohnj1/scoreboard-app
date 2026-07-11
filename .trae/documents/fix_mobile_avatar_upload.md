# Plan: Fix Mobile Avatar Upload

## Summary
When testing avatar uploads from a mobile device (camera or gallery), the upload failed. The issue is likely caused by the device providing a file with a non-standard or unexpected extension (like `.heic`, `.heif`, or no extension at all), which is rejected by the strict Row Level Security (RLS) policy we applied to the `avatars` bucket. Additionally, if the device uploads a raw `.heic` file, it might not render correctly on non-Apple devices. We will update both the client-side logic to normalize file extensions and the database RLS policy to be more forgiving.

## Current State Analysis
- **File**: `src/pages/ProfilePage.tsx` simply splits the filename by `.` and takes the last part as the extension. If a mobile device provides a file named `image` or `photo.HEIC`, it uploads with that exact extension.
- **File**: `supabase/migrations/20260712_fix_avatars_storage_rls.sql` restricts uploads strictly to `['jpg', 'jpeg', 'png', 'webp']`.

## Proposed Changes

### 1. Normalize File Extensions on the Client
- **File**: `src/pages/ProfilePage.tsx`
- **What/How**:
  - Update `handleAvatarUpload` to intelligently determine the file extension.
  - Fall back to the file's MIME type (`file.type`) if the extension from `file.name` isn't a standard web image format.
  - Ensure the final extension is lowercase and defaults to `jpeg` if it can't be reliably determined, preventing RLS rejection.

### 2. Broaden Storage RLS Allowed Extensions
- **File**: `supabase/migrations/20260712_fix_avatars_storage_rls.sql`
- **What/How**:
  - Update the `Allow uploads for custom auth` policy's `WITH CHECK` array to also include `heic`, `heif`, and `gif` to prevent database-level rejection of these formats if they do slip through.
  - Re-run `npx supabase db push` to apply the relaxed rules to the connected project.

## Verification
1. Review the code changes to ensure the file extension is robustly extracted and normalized.
2. Run `npm run build` to verify there are no TypeScript errors.
3. Once deployed or tested locally via `--host`, verify that a photo taken from the mobile camera successfully uploads and renders.