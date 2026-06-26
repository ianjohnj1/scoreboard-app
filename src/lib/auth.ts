import { supabase } from './supabase';
import type { Profile } from './supabase';

// Simple PIN hashing (deterministic, client-side)
export async function hashPin(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(`scorekeeper:${pin}:salt2024`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createUser(
  displayName: string,
  pin: string,
  username: string,
  isAdmin = false
): Promise<Profile | null> {
  const pin_hash = await hashPin(pin);
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      display_name: displayName,
      username: username.toLowerCase().trim(),
      pin_hash,
      is_guest: false,
      is_admin: isAdmin,
      avatar_color: randomAvatarColor(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createGuestProfile(displayName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      display_name: displayName.trim(),
      is_guest: true,
      is_admin: false,
      avatar_color: randomAvatarColor(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function loginWithPin(username: string, pin: string): Promise<Profile | null> {
  const pin_hash = await hashPin(pin);
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase().trim())
    .eq('pin_hash', pin_hash)
    .eq('is_guest', false)
    .maybeSingle();
  if (data) {
    await supabase
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.id);
  }
  return data;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name');
  if (error) throw error;
  return data || [];
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
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
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function randomAvatarColor(): string {
  const colors = [
    '#3b82f6', '#10b981', '#f97316', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899',
    '#14b8a6', '#84cc16',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
