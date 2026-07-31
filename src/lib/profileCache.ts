import { supabase, SAFE_PROFILE_COLUMNS } from './supabase';
import type { Profile } from './supabase';

// display_name/avatar_color/avatar_url rarely change mid-session, but
// MatchRoomPage/SpectatorPage re-fetch the full roster's profiles on every
// realtime-triggered refresh. This is a session-lifetime cache, not a live
// data source - callers that mutate a profile (ProfilePage) must call
// setProfile()/invalidateProfile() themselves so their own next read is
// correct rather than relying on a TTL.
const cache = new Map<string, Profile>();

export async function getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const uniqueIds = [...new Set(ids)];
  const missing = uniqueIds.filter(id => !cache.has(id));

  if (missing.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .in('id', missing);

    if (error) throw error;

    (data || []).forEach((row) => {
      cache.set(row.id, { ...row, pin_hash: null } as Profile);
    });
  }

  const result = new Map<string, Profile>();
  uniqueIds.forEach((id) => {
    const profile = cache.get(id);
    if (profile) result.set(id, profile);
  });
  return result;
}

export function setProfile(profile: Profile): void {
  cache.set(profile.id, profile);
}

export function invalidateProfile(id: string): void {
  cache.delete(id);
}
