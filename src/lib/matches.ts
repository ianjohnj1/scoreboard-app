import { supabase } from './supabase';
import type { MatchRoom, MatchTeam, MatchPlayer } from './supabase';

export async function getMatchByCode(code: string): Promise<MatchRoom | null> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('room_code', code)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

export async function getMatchById(id: string): Promise<MatchRoom | null> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

export async function getMatchTeams(matchId: string): Promise<MatchTeam[]> {
  const { data, error } = await supabase
    .from('match_teams')
    .select('*')
    .eq('match_id', matchId)
    .order('sort_order');
  
  if (error) throw error;
  return data || [];
}

export async function getMatchPlayers(matchId: string): Promise<MatchPlayer[]> {
  const { data, error } = await supabase
    .from('match_players')
    .select('*')
    .eq('match_id', matchId);
  
  if (error) throw error;
  return data || [];
}

export async function updateMatchStatus(matchId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('match_rooms')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', matchId);
  
  if (error) throw error;
}

export async function getRecentMatches(limit = 10): Promise<MatchRoom[]> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

export async function getActiveMatches(): Promise<MatchRoom[]> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function deleteMatch(matchId: string): Promise<void> {
  // First, delete related records manually in case cascading isn't set up
  // We do this in parallel to be efficient
  try {
    // 1. Clear any references in the match_rooms record itself first to avoid FK issues
    await supabase.from('match_rooms').update({ 
      winner_team_id: null, 
      winner_profile_id: null 
    }).eq('id', matchId);

    // 2. Delete related records in other tables
    await Promise.all([
      supabase.from('match_events').delete().eq('match_id', matchId),
      supabase.from('match_players').delete().eq('match_id', matchId),
      supabase.from('match_teams').delete().eq('match_id', matchId),
      supabase.from('cricket_innings').delete().eq('match_id', matchId),
      supabase.from('cricket_player_stats').delete().eq('match_id', matchId),
      supabase.from('golf_holes').delete().eq('match_id', matchId),
      supabase.from('golf_scores').delete().eq('match_id', matchId),
      // Also clear active sessions pointing to this match
      supabase.from('active_sessions').update({ match_id: null }).eq('match_id', matchId)
    ]);

    // 3. Finally, delete the match room
    const { error } = await supabase
      .from('match_rooms')
      .delete()
      .eq('id', matchId);
    
    if (error) throw error;
  } catch (error) {
    console.error("Error in deleteMatch:", error);
    throw error;
  }
}

export async function getLiveActivity(): Promise<any[]> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select(`
      *,
      created_by_profile:profiles!match_rooms_created_by_fkey(display_name, avatar_color)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) throw error;
  
  // Filter out matches where the profile is missing (orphaned records)
  return (data || [])
    .filter(match => match.created_by_profile)
    .map(match => ({
      session: { id: match.id },
      profile: match.created_by_profile,
      match: match
    }));
}

export async function recordEvent(
  matchId: string,
  eventType: string,
  eventData: Record<string, any> = {},
  playerId?: string,
  teamId?: string,
  recordedBy?: string
): Promise<void> {
  // Get sequence num
  const { count } = await supabase
    .from('match_events')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId);

  const { error } = await supabase
    .from('match_events')
    .insert({
      match_id: matchId,
      event_type: eventType,
      event_data: eventData,
      player_id: playerId || null,
      team_id: teamId || null,
      recorded_by: recordedBy || null,
      sequence_num: (count || 0) + 1,
      is_undone: false,
    });
  
  if (error) throw error;
}

export async function undoLastEvent(matchId: string): Promise<void> {
  // Find last non-undone event
  const { data: lastEvent, error: fetchError } = await supabase
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .eq('is_undone', false)
    .order('sequence_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!lastEvent) return;

  const { error: updateError } = await supabase
    .from('match_events')
    .update({ is_undone: true })
    .eq('id', lastEvent.id);

  if (updateError) throw updateError;
}

export function getSpectatorUrl(roomCode: string): string {
  return `${window.location.origin}/spectate/${roomCode}`;
}

export function getSportIcon(sport: string): string {
  const icons: Record<string, string> = {
    cricket: '🏏',
    golf: '⛳',
    darts: '🎯',
    table_tennis: '🏓',
    pool: '🎱',
    basketball: '🏀',
    cards: '🃏',
    custom: '🎮',
  };
  return icons[sport] || '🎮';
}

export function getSportLabel(sport: string, customName?: string | null): string {
  if (sport === 'custom' && customName) return customName;
  const labels: Record<string, string> = {
    cricket: 'Cricket',
    golf: 'Golf',
    darts: 'Darts',
    table_tennis: 'Table Tennis',
    pool: 'Pool',
    basketball: 'Basketball',
    cards: 'Cards',
    custom: 'Custom Game',
  };
  return labels[sport] || 'Unknown Sport';
}
