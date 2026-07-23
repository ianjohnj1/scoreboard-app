-- RLS Lockdown Step 3: stop exposing profiles.pin_hash to anon/authenticated.
-- Safe only now that Step 2 removed every client-side .eq('pin_hash', ...) /
-- .is('pin_hash', null) filter - filtering on a column requires SELECT privilege
-- on it, so this would have broken login if shipped before Step 2.

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, is_guest, is_admin, avatar_color,
  avatar_url, catchphrase, linked_profile_id, created_at, updated_at
) ON public.profiles TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
