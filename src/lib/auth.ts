import { supabase } from './supabase';
import type { Profile } from './supabase';
import { SAFE_PROFILE_COLUMNS } from './supabase';

// Kept only for linkGuestAccount()'s client-driven update path; login/signup now
// verify PINs server-side via rpc_login/rpc_signup so the plaintext PIN never needs
// to be hashed (or the hash compared) by client code for those flows.
export async function hashPin(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(`scorekeeper:${pin}:salt2024`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export type ProfileWithSession = Profile & { session_id: string };

export async function createUser(
  displayName: string,
  pin: string,
  username: string
): Promise<ProfileWithSession | null> {
  const { data, error } = await supabase.rpc('rpc_signup', {
    p_display_name: displayName,
    p_pin: pin,
    p_username: username,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, pin_hash: null } : null;
}

export async function loginWithPin(username: string, pin: string): Promise<ProfileWithSession | null> {
  const { data, error } = await supabase.rpc('rpc_login', {
    p_username: username,
    p_pin: pin,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, pin_hash: null } : null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .order('display_name');
  if (error) throw error;
  return (data || []).map(p => ({ ...p, pin_hash: null }));
}

export async function linkGuestAccount(
  guestId: string,
  displayName: string,
  username: string,
  pin: string
): Promise<Profile | null> {
  const pin_hash = await hashPin(pin);
  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.trim(),
      username: username.toLowerCase().trim(),
      pin_hash,
      is_guest: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', guestId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return { ...data, pin_hash: null };
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
