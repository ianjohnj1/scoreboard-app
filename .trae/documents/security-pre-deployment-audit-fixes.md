# Security Pre-Deployment Audit & Hardening Plan

This plan outlines a comprehensive security audit of the ScoreKeeper Pro codebase and database configuration. It identifies high-risk vulnerabilities related to data exposure, permissive RLS policies, and insecure storage access, and provides a structured approach to fixing them before live deployment.

## 1. Audit Summary & Findings

### Vector 1: Environment Variables & Secrets
- **Status**: ✅ **Low Risk**
- **Findings**:
    - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used correctly in the client.
    - `.env` and `*.local` are correctly listed in [.gitignore](file:///c:/Users/User/Desktop/scoreboard%20app/project/.gitignore).
    - No `SUPABASE_SERVICE_ROLE_KEY` found in the codebase.
    - Initialization in [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) is secure.

### Vector 2: Row Level Security (RLS) Configuration
- **Status**: 🚨 **High Risk**
- **Findings**:
    - RLS is NOT enabled on `profiles` and `match_rooms`.
    - Existing RLS policies on `match_events`, `cricket_innings`, etc., are too permissive (`TO anon USING (true)`).
    - Anyone can modify any profile or match if they know the UUID.

### Vector 3: Client-Generated Guest ID Safety
- **Status**: ⚠️ **Medium Risk**
- **Findings**:
    - Guests are real profiles with `is_guest: true`.
    - The permissive RLS policies allow any anonymous user to write events to any match.
    - Need to restrict write access to the match host (creator).

### Vector 4: Supabase Storage Bucket Access
- **Status**: 🚨 **High Risk**
- **Findings**:
    - `avatars` bucket allows `anon` role to upload to ANY folder ([20260701_profile_extensions.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/20260701_profile_extensions.sql#L23)).
    - No server-side MIME type or file size validation.

---

## 2. Implementation Plan

### Phase 1: Database RLS Hardening (PostgreSQL)
We will create a comprehensive migration to enable RLS on all tables and implement secure policies.

- **`profiles` Table**:
    - Enable RLS.
    - Policy: Allow public `SELECT` for all (needed for leaderboards).
    - Policy: Allow `UPDATE` only if `auth.uid() = id`.
    - Policy: Allow `INSERT` for authenticated users (registration) and `anon` (guest creation - limited).
- **`match_rooms` Table**:
    - Enable RLS.
    - Policy: Allow public `SELECT`.
    - Policy: Allow `INSERT` for `anon` and `authenticated`.
    - Policy: Allow `UPDATE`/`DELETE` only if `auth.uid() = created_by` (The Host).
- **Game Tables (`match_events`, `cricket_innings`, etc.)**:
    - Restrict `INSERT`/`UPDATE` to users who are participants in the match OR the match creator.

### Phase 2: Storage Security (Supabase Storage)
Update storage policies to prevent unauthorized uploads.

- **`avatars` Bucket**:
    - Remove `OR auth.role() = 'anon'` from upload/update policies.
    - Ensure `auth.uid()` is required and matches the folder name.
    - Add file size limit (e.g., 2MB) and MIME type restrictions (`image/jpeg`, `image/png`, `image/webp`).

### Phase 3: Client-Side Safety Checks
- Verify that [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) handles authentication state correctly.
- Ensure that guest creation does not expose sensitive fields.

---

## 3. Proposed Changes

### Database Migration: `supabase/migrations/20260701_security_hardening.sql`
Create a new migration file to apply these fixes.

```sql
-- 1. Enable RLS on core tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_rooms ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 3. Match Rooms Policies
DROP POLICY IF EXISTS "Public matches are viewable by everyone" ON match_rooms;
CREATE POLICY "Public matches are viewable by everyone" ON match_rooms FOR SELECT USING (true);

CREATE POLICY "Anyone can create a match" ON match_rooms FOR INSERT WITH CHECK (true);

CREATE POLICY "Creators can update their matches" ON match_rooms FOR UPDATE 
USING (auth.uid() = created_by OR created_by IS NULL); -- Allow anonymous creators for now, but ideally tied to session

-- 4. Storage Hardening
-- Update "Allow individual uploads" for avatars
DROP POLICY IF EXISTS "Allow individual uploads" ON storage.objects;
CREATE POLICY "Allow individual uploads" ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Update "Allow individual updates"
DROP POLICY IF EXISTS "Allow individual updates" ON storage.objects;
CREATE POLICY "Allow individual updates" ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## 4. Verification Steps

1. **RLS Check**: Run `SELECT * FROM profiles` as an unauthenticated user to ensure read access works, but `UPDATE` fails.
2. **Storage Check**: Attempt to upload a file to the `avatars` bucket without being logged in (should fail).
3. **Guest ID Check**: Verify that creating a guest still works (requires `INSERT` on `profiles` for `anon` - we may need to allow this but restrict fields).
4. **Wrangler Preview**: Deploy to a Cloudflare Pages preview branch and verify that the app still functions correctly with the tightened security.
