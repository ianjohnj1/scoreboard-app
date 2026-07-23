import { supabase } from './supabase';
import type { MatchRoom, MatchTeam, MatchPlayer } from './supabase';
import { updateCareerStats } from './stats';

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
    .eq('match_id', matchId)
    .order('batting_order', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function updateMatchStatus(matchId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('match_rooms')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', matchId);
  
  if (error) throw error;

  // Trigger stats update if match is completed
  if (status === 'completed') {
    try {
      console.log(`Match ${matchId} completed. Updating career stats...`);
      await updateCareerStats(matchId);
      console.log(`Successfully updated career stats for match ${matchId}`);
    } catch (err) {
      console.error(`CRITICAL: Failed to update career stats for match ${matchId} after retries:`, err);
      // We don't throw here to avoid breaking the match completion flow in the UI,
      // but we log it as critical for debugging.
    }
  }
}

export async function completeMatchWithWinner(matchId: string, winnerProfileId: string): Promise<void> {
  const { error } = await supabase
    .from('match_rooms')
    .update({
      winner_profile_id: winnerProfileId,
      winner_team_id: null,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;

  try {
    console.log(`Match ${matchId} completed with winner ${winnerProfileId}. Updating career stats...`);
    await updateCareerStats(matchId);
    console.log(`Successfully updated career stats for match ${matchId}`);
  } catch (err) {
    console.error(`CRITICAL: Failed to update career stats for match ${matchId} after winner completion:`, err);
  }
}

export async function completeMatchWithTeamWinner(matchId: string, winnerTeamId: string): Promise<void> {
  const { error } = await supabase
    .from('match_rooms')
    .update({
      winner_team_id: winnerTeamId,
      winner_profile_id: null,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;

  try {
    console.log(`Match ${matchId} completed with team winner ${winnerTeamId}. Updating career stats...`);
    await updateCareerStats(matchId);
    console.log(`Successfully updated career stats for match ${matchId}`);
  } catch (err) {
    console.error(`CRITICAL: Failed to update career stats for match ${matchId} after team winner completion:`, err);
  }
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
  try {
    const { error: clearWinnerError } = await supabase
      .from('match_rooms')
      .update({
        winner_team_id: null,
        winner_profile_id: null,
      })
      .eq('id', matchId);

    if (clearWinnerError) throw clearWinnerError;

    // Delete dependents in a safe order so child rows are removed before parents.
    const operations: Array<{ label: string; run: () => Promise<{ error: Error | null }> }> = [
      {
        label: 'match_events',
        run: async () => await supabase.from('match_events').delete().eq('match_id', matchId),
      },
      {
        // comments is polymorphic (context_type/context_id) so it has no FK
        // to match_rooms and no DB-level cascade - must clean up explicitly.
        label: 'comments',
        run: async () => await supabase.from('comments').delete().eq('context_type', 'match').eq('context_id', matchId),
      },
      {
        label: 'cricket_player_stats',
        run: async () => await supabase.from('cricket_player_stats').delete().eq('match_id', matchId),
      },
      {
        label: 'cricket_innings',
        run: async () => await supabase.from('cricket_innings').delete().eq('match_id', matchId),
      },
      {
        label: 'golf_scores',
        run: async () => await supabase.from('golf_scores').delete().eq('match_id', matchId),
      },
      {
        label: 'golf_holes',
        run: async () => await supabase.from('golf_holes').delete().eq('match_id', matchId),
      },
      {
        label: 'match_players',
        run: async () => await supabase.from('match_players').delete().eq('match_id', matchId),
      },
      {
        label: 'match_teams',
        run: async () => await supabase.from('match_teams').delete().eq('match_id', matchId),
      },
      {
        label: 'active_sessions',
        run: async () => await supabase.from('active_sessions').update({ match_id: null }).eq('match_id', matchId),
      },
    ];

    for (const operation of operations) {
      const { error } = await operation.run();
      if (error) {
        console.error(`Error cleaning up ${operation.label} during deleteMatch:`, error);
        throw error;
      }
    }

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
      created_by_profile:profiles!match_rooms_created_by_fkey(display_name, avatar_color, avatar_url)
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

export function getSportLabel(sport: string, customName?: string | null, variant?: string | null): string {
  if (customName) return customName;
  const labels: Record<string, string> = {
    cricket: 'Cricket',
    golf: 'Golf',
    chip_off: 'Chip Off',
    darts: 'Darts',
    table_tennis: 'Table Tennis',
    pool: 'Pool',
    basketball: 'Basketball',
    cards: 'Cards',
    custom: 'Custom Game',
  };
  
  const baseLabel = labels[sport] || 'Unknown Sport';

  if (variant) {
    if (variant === 'chip_off') return 'Chip Off';
    if (variant === 'putt_vs_putt') return 'PvP (Putt vs Putt)';
    if (variant === 'backyard') return 'Backyard Cricket';
    if (variant === 'countdown') return 'Darts - 501/301';
    if (variant === 'around_the_world') return 'Darts - Around the World';
    if (variant === 'killer') return 'Darts - Killer';
    if (variant === 'classic') return baseLabel;
  }

  return baseLabel;
}
