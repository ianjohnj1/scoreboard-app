import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent, undoLastEvent, completeMatchWithWinner, completeMatchWithTeamWinner } from '../../lib/matches';
import Modal from '../Modal';
import Avatar from '../Avatar';
import { Trophy, RotateCcw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { CricketInnings, CricketPlayerStats, MatchTeam, Profile } from '../../lib/supabase';

type DismissalMethod = 'Bowled' | 'Caught' | 'LBW' | 'Run Out' | 'Stumped' | 'Hit Wicket' | 'Caught & Bowled';

interface CricketHouseRules {
  no_noballs?: boolean;
  no_wides?: boolean;
  max_overs?: number;
  max_wickets?: number;
  variant?: 'classic' | 'backyard';
}

export default function CricketRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;
  const houseRules = (match.house_rules || {}) as CricketHouseRules;

  const [innings, setInnings] = useState<CricketInnings | null>(null);
  const [playerStats, setPlayerStats] = useState<Map<string, CricketPlayerStats>>(new Map());
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [partnership, setPartnership] = useState({ runs: 0, balls: 0 });
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [wicketData, setWicketData] = useState<{
    method: DismissalMethod;
    dismissedBy: string;
    fieldedBy: string;
  }>({ method: 'Bowled', dismissedBy: '', fieldedBy: '' });
  const [milestoneMsg, setMilestoneMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const [showNextBatterModal, setShowNextBatterModal] = useState(false);
  const [nextBatterProfileId, setNextBatterProfileId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const loadRecentEvents = useCallback(async (signal?: AbortSignal) => {
    const { data, error } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', match.id)
      .eq('is_undone', false)
      .order('sequence_num', { ascending: false })
      .limit(12)
      .abortSignal(signal);

    if (!isMountedRef.current) return;

    if (error) {
      if (!error.message?.includes('AbortError')) {
        console.error("Error loading recent events:", error);
      }
      return;
    }

    setRecentEvents(data || []);

    // Calculate partnership
    if (data) {
      let pRuns = 0;
      let pBalls = 0;
      for (const event of data) {
        if (event.event_type === 'wicket') break;
        if (event.event_type === 'delivery') {
          pRuns += event.event_data.runs || 0;
          const extra = event.event_data.extra;
          if (!extra || extra === 'bye' || extra === 'legbye') pBalls++;
        }
      }
      setPartnership({ runs: pRuns, balls: pBalls });
    }
  }, [match.id]);

  const loadInnings = useCallback(async () => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setLoading(true);
      await loadRecentEvents(signal);
      const { data, error } = await supabase
        .from('cricket_innings')
        .select('*')
        .eq('match_id', match.id)
        .eq('is_completed', false)
        .order('innings_number', { ascending: false })
        .limit(1)
        .maybeSingle()
        .abortSignal(signal);

      if (!isMountedRef.current) return;

      if (error) {
        if (!error.message?.includes('AbortError')) {
          console.error("Error loading innings:", error);
        }
        return;
      }

      if (data) {
        setInnings(data);
        // Load player stats
        const { data: stats, error: statsError } = await supabase
          .from('cricket_player_stats')
          .select('*')
          .eq('innings_id', data.id)
          .abortSignal(signal);
        
        if (!isMountedRef.current) return;

        if (statsError) {
          if (!statsError.message?.includes('AbortError')) {
            console.error("Error loading stats:", statsError);
          }
        } else {
          const map = new Map((stats || []).map((s: CricketPlayerStats) => [s.profile_id, s]));
          setPlayerStats(map);
        }
      } else {
        // No active innings - try to start one if no innings exist
        const { count, error: countError } = await supabase
          .from('cricket_innings')
          .select('*', { count: 'exact', head: true })
          .eq('match_id', match.id)
          .abortSignal(signal);
        
        if (!isMountedRef.current) return;

        if (countError) {
          if (!countError.message?.includes('AbortError')) {
            console.error("Error checking innings count:", countError);
          }
        } else if (!count || count === 0) {
          await startFirstInnings();
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
      console.error("Caught error in loadInnings:", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [match.id, loadRecentEvents]);

  const startFirstInnings = async () => {
    setLoading(true);
    try {
      // In Backyard mode, we don't have teams, so we leave these as null
      const { data: newInnings, error } = await supabase.from('cricket_innings').insert({
        match_id: match.id,
        innings_number: 1,
        batting_team_id: ctx.isBackyard ? null : (teams[0]?.id || null),
        bowling_team_id: ctx.isBackyard ? null : (teams[1]?.id || null),
      }).select().single();

      if (error) {
        console.error("Failed to start first innings:", error);
        return;
      }
      
      setInnings(newInnings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadInnings(); 
  }, [loadInnings]);

  // Subscribe realtime
  useEffect(() => {
    const handleRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        loadInnings();
      }, 200); // 200ms debounce
    };

    const channel = supabase
      .channel(`cricket:${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cricket_innings', filter: `match_id=eq.${match.id}` }, () => handleRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cricket_player_stats', filter: `match_id=eq.${match.id}` }, () => handleRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` }, () => handleRefresh())
      .subscribe();
    return () => { 
      supabase.removeChannel(channel);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [match.id, loadInnings]);

  const battingTeam = teams.find(t => t.id === innings?.batting_team_id);
  const bowlingTeam = teams.find(t => t.id === innings?.bowling_team_id);

  const battingPlayers = ctx.isBackyard 
    ? players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[]
    : players.filter(p => p.team_id === battingTeam?.id).map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];

  const bowlingPlayers = ctx.isBackyard 
    ? players
        .filter(p => p.profile_id !== innings?.current_batter1_id && p.profile_id !== innings?.current_batter2_id)
        .map(p => profiles.get(p.profile_id))
        .filter(Boolean) as Profile[]
    : players.filter(p => p.team_id === bowlingTeam?.id).map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];

  const currentBatter1 = innings?.current_batter1_id ? profiles.get(innings.current_batter1_id) : null;
  const currentBatter2 = innings?.current_batter2_id ? profiles.get(innings.current_batter2_id) : null;
  const currentBowler = innings?.current_bowler_id ? profiles.get(innings.current_bowler_id) : null;

  const overs = innings ? `${Math.floor(innings.balls / 6)}.${innings.balls % 6}` : '0.0';
  const crr = innings && innings.balls > 0
    ? ((innings.total_runs / innings.balls) * 6).toFixed(2)
    : '0.00';

  const getOrCreatePlayerStat = async (profileId: string, inningsId: string): Promise<string> => {
    const existing = playerStats.get(profileId);
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from('cricket_player_stats')
      .insert({ innings_id: inningsId, match_id: match.id, profile_id: profileId })
      .select()
      .single();
    
    if (error || !data) {
      throw new Error(error?.message || "Failed to create player stat record");
    }
    return data.id;
  };

  const handleDelivery = async (runs: number, extra?: 'wide' | 'noball' | 'bye' | 'legbye') => {
    if (!innings || !currentBatter1 || loading) return;

    // Check match end
    if (houseRules.max_overs && innings.balls >= houseRules.max_overs * 6) {
      handleCompleteMatch();
      return;
    }
    if (houseRules.max_wickets && innings.wickets >= houseRules.max_wickets) {
      handleCompleteMatch();
      return;
    }

    setLoading(true);
    try {
      const isExtra = !!extra;
      let countsAsBall = !extra || extra === 'bye' || extra === 'legbye';
      
      // Backyard extras rules
      if (ctx.isBackyard) {
        if (extra === 'wide' && houseRules.no_wides) countsAsBall = true;
        if (extra === 'noball' && houseRules.no_noballs) countsAsBall = true;
      }

      // Calculate strike rotation (only for classic matches)
      let shouldSwap = false;
      if (!ctx.isBackyard && innings.current_batter2_id) {
        const oddRuns = (!extra || extra === 'bye' || extra === 'legbye') && (runs % 2 !== 0);
        const overEnd = countsAsBall && (innings.balls + 1) % 6 === 0;
        
        // XOR logic: swap if either is true, but not both (they cancel out)
        if (oddRuns !== overEnd) shouldSwap = true;
      }

      // Update innings
      const inningsUpdate: Record<string, any> = {
        total_runs: innings.total_runs + runs,
        updated_at: new Date().toISOString()
      };
      if (countsAsBall) inningsUpdate.balls = innings.balls + 1;
      
      if (extra === 'wide') inningsUpdate.extras_wide = (innings.extras_wide || 0) + runs;
      else if (extra === 'noball') inningsUpdate.extras_noball = (innings.extras_noball || 0) + 1;
      else if (extra === 'bye') inningsUpdate.extras_bye = (innings.extras_bye || 0) + runs;
      else if (extra === 'legbye') inningsUpdate.extras_legbye = (innings.extras_legbye || 0) + runs;

      // Apply strike swap if needed
      if (shouldSwap) {
        inningsUpdate.current_batter1_id = innings.current_batter2_id;
        inningsUpdate.current_batter2_id = innings.current_batter1_id;
      }

      await supabase.from('cricket_innings').update(inningsUpdate).eq('id', innings.id);

      // Update batter stats
      const batterStatId = await getOrCreatePlayerStat(currentBatter1.id, innings.id);
      const stat = playerStats.get(currentBatter1.id);
      
      // In backyard mode, extras might add to batter's score
      let batterRuns = isExtra ? 0 : runs;
      if (ctx.isBackyard && isExtra) {
        if (extra === 'wide' || extra === 'noball') {
          batterRuns = 1; // +1 for the batter for extras
        }
      }
      const newRuns = (stat?.bat_runs || 0) + batterRuns;
      
      const batterUpdate: Record<string, any> = {
        bat_runs: newRuns,
        bat_balls: (stat?.bat_balls || 0) + (countsAsBall ? 1 : 0),
      };

      if (!isExtra) {
        if (runs === 0) batterUpdate.bat_dots = (stat?.bat_dots || 0) + 1;
        else if (runs === 1) batterUpdate.bat_ones = (stat?.bat_ones || 0) + 1;
        else if (runs === 2) batterUpdate.bat_twos = (stat?.bat_twos || 0) + 1;
        else if (runs === 3) batterUpdate.bat_threes = (stat?.bat_threes || 0) + 1;
        else if (runs === 4) batterUpdate.bat_fours = (stat?.bat_fours || 0) + 1;
        else if (runs === 5) batterUpdate.bat_fives = (stat?.bat_fives || 0) + 1;
        else if (runs === 6) batterUpdate.bat_sixes = (stat?.bat_sixes || 0) + 1;
      }

      // Check milestone
      let milestone = '';
      if (!stat?.scored_fifty && newRuns >= 50 && newRuns < 100) {
        batterUpdate.scored_fifty = true;
        milestone = `${currentBatter1.display_name} scores a HALF-CENTURY! 50!`;
      } else if (!stat?.scored_century && newRuns >= 100) {
        batterUpdate.scored_century = true;
        if (!stat?.scored_fifty) batterUpdate.scored_fifty = true;
        milestone = `${currentBatter1.display_name} scores a CENTURY! 100!`;
      }
      if (milestone) { setMilestoneMsg(milestone); setTimeout(() => setMilestoneMsg(''), 5000); }

      await supabase.from('cricket_player_stats').update(batterUpdate).eq('id', batterStatId);

      // Update bowler stats
      if (currentBowler && countsAsBall) {
        const bowlerStatId = await getOrCreatePlayerStat(currentBowler.id, innings.id);
        const bowlerStat = playerStats.get(currentBowler.id);
        await supabase.from('cricket_player_stats').update({
          bowl_balls: (bowlerStat?.bowl_balls || 0) + 1,
          bowl_runs: (bowlerStat?.bowl_runs || 0) + runs + (extra === 'wide' || extra === 'noball' ? 1 : 0),
          bowl_dots: (bowlerStat?.bowl_dots || 0) + (runs === 0 && !extra ? 1 : 0),
        }).eq('id', bowlerStatId);
      }

      // Record event
      await recordEvent(match.id, 'delivery', { 
        runs, 
        extra: extra || null,
        bowler_id: currentBowler?.id || null
      }, currentBatter1.id, undefined, currentUser?.id);
      
      // Check for over completion
      if (countsAsBall && (innings.balls + 1) % 6 === 0) {
        setShowBowlerModal(true);
      }

      await loadInnings();
    } catch (err) {
      console.error("Error handling delivery:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleWicket = async () => {
    if (!innings || !currentBatter1 || !currentBowler || loading) return;
    setLoading(true);
    try {
      const statId = await getOrCreatePlayerStat(currentBatter1.id, innings.id);
      const stat = playerStats.get(currentBatter1.id);

      await supabase.from('cricket_player_stats').update({
        bat_dismissed: true,
        bat_dismissal_method: wicketData.method,
        bat_dismissed_by: wicketData.dismissedBy || currentBowler.id,
        bat_fielded_by: wicketData.fieldedBy || null,
        bat_balls: (stat?.bat_balls || 0) + 1,
      }).eq('id', statId);

      // Update bowler
      const bowlerStatId = await getOrCreatePlayerStat(currentBowler.id, innings.id);
      const bowlerStat = playerStats.get(currentBowler.id);
      await supabase.from('cricket_player_stats').update({
        bowl_wickets: (bowlerStat?.bowl_wickets || 0) + 1,
        bowl_balls: (bowlerStat?.bowl_balls || 0) + 1,
      }).eq('id', bowlerStatId);

      // Update innings wickets & clear batter
      let nextBatter1Id: string | null = innings.current_batter2_id;
      let nextBatter2Id: string | null = null;

      if (ctx.isBackyard) {
          // Auto-rotate batter based on join order (batting_order)
          const sortedPlayers = [...players].sort((a, b) => (a.batting_order || 0) - (b.batting_order || 0));
          
          if (sortedPlayers.length > 0) {
            const currentIdx = sortedPlayers.findIndex(p => p.profile_id === currentBatter1.id);
            
            // Find the next player in the rotation
            const nextIdx = (currentIdx + 1) % sortedPlayers.length;
            const nextP = sortedPlayers[nextIdx];
            nextBatter1Id = nextP.profile_id;
            
            // Reset their bat_dismissed status so they appear active
            const nextStatId = await getOrCreatePlayerStat(nextBatter1Id, innings.id);
            await supabase.from('cricket_player_stats').update({
              bat_dismissed: false,
              bat_dismissal_method: null,
              bat_dismissed_by: null,
              bat_fielded_by: null
            }).eq('id', nextStatId);

            // Show Next Batter Modal
            setNextBatterProfileId(nextBatter1Id);
            setShowNextBatterModal(true);
          }
        }

      await supabase.from('cricket_innings').update({
        wickets: innings.wickets + 1,
        balls: innings.balls + 1,
        current_batter1_id: nextBatter1Id,
        current_batter2_id: nextBatter2Id,
      }).eq('id', innings.id);

      await recordEvent(match.id, 'wicket', { method: wicketData.method, dismissedBy: wicketData.dismissedBy }, currentBatter1.id, undefined, currentUser?.id);
      setShowWicketModal(false);
      setWicketData({ method: 'Bowled', dismissedBy: '', fieldedBy: '' });
      await loadInnings();
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    await undoLastEvent(match.id);
    // Reload innings from scratch by replaying events would be complex; for now refresh
    await loadInnings();
  };

  const completeOverEarly = async () => {
    if (!innings || !currentBowler) return;
    const ballsInOver = innings.balls % 6;
    if (ballsInOver === 0) return;

    const remaining = 6 - ballsInOver;
    setLoading(true);
    try {
      // Update innings
      await supabase.from('cricket_innings').update({
        balls: innings.balls + remaining,
        updated_at: new Date().toISOString()
      }).eq('id', innings.id);

      // Update bowler stats
      const bowlerStatId = await getOrCreatePlayerStat(currentBowler.id, innings.id);
      const bowlerStat = playerStats.get(currentBowler.id);
      await supabase.from('cricket_player_stats').update({
        bowl_balls: (bowlerStat?.bowl_balls || 0) + remaining,
        bowl_dots: (bowlerStat?.bowl_dots || 0) + remaining,
      }).eq('id', bowlerStatId);

      // Record dot ball events
      const { count } = await supabase
        .from('match_events')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', match.id);

      const startSeq = (count || 0) + 1;
      const events = Array.from({ length: remaining }).map((_, i) => ({
        match_id: match.id,
        event_type: 'delivery',
        event_data: { runs: 0, extra: null, auto_dot: true },
        recorded_by: currentUser?.id || null,
        sequence_num: startSeq + i,
        is_undone: false
      }));

      await supabase.from('match_events').insert(events);
    } catch (err) {
      console.error("Error completing over early:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateBatter = async (slot: 1 | 2, profileId: string) => {
    if (!innings) return;
    
    // In backyard mode, if the current bowler is being selected as batter, complete their over first
    if (ctx.isBackyard && profileId === currentBowler?.id && (innings.balls % 6 !== 0)) {
      await completeOverEarly();
    }

    const field = slot === 1 ? 'current_batter1_id' : 'current_batter2_id';
    await supabase.from('cricket_innings').update({ [field]: profileId || null }).eq('id', innings.id);
    await loadInnings();
  };

  const updateBowler = async (profileId: string) => {
    if (!innings) return;

    // In backyard mode, if changing bowler mid-over, complete the over for the previous bowler
    if (ctx.isBackyard && currentBowler && profileId !== currentBowler.id && (innings.balls % 6 !== 0)) {
      await completeOverEarly();
    }

    await supabase.from('cricket_innings').update({ current_bowler_id: profileId || null }).eq('id', innings.id);
    await loadInnings();
  };

  const switchInnings = async () => {
    if (!innings) return;
    await supabase.from('cricket_innings').update({ is_completed: true }).eq('id', innings.id);
    const { data: newInnings } = await supabase.from('cricket_innings').insert({
      match_id: match.id,
      innings_number: (innings.innings_number || 1) + 1,
      batting_team_id: innings.bowling_team_id,
      bowling_team_id: innings.batting_team_id,
      target_runs: innings.total_runs + 1,
    }).select().single();
    setInnings(newInnings);
    setPlayerStats(new Map());
  };

  const handleCompleteMatch = async () => {
    if (!match || match.status === 'completed') return;
    setLoading(true);
    try {
      if (ctx.isBackyard) {
        // Find player with most runs
        let maxRuns = -1;
        let winnerId = null;
        for (const [profileId, stat] of playerStats.entries()) {
          if (stat.bat_runs > maxRuns) {
            maxRuns = stat.bat_runs;
            winnerId = profileId;
          }
        }
        if (winnerId) {
          await completeMatchWithWinner(match.id, winnerId);
        }
      } else {
        // Find team with most runs. In a real match you'd check both innings
        // Here we just pick the team currently batting if they chased it, or bowling team
        // Let's do a basic comparison if there are two innings
        const { data: allInnings } = await supabase
          .from('cricket_innings')
          .select('*')
          .eq('match_id', match.id);
        
        let team1Runs = 0;
        let team2Runs = 0;
        let team1Id = ctx.teams[0]?.id;
        let team2Id = ctx.teams[1]?.id;

        if (allInnings) {
          allInnings.forEach(inn => {
            if (inn.batting_team_id === team1Id) team1Runs += inn.total_runs;
            if (inn.batting_team_id === team2Id) team2Runs += inn.total_runs;
          });
        }
        
        let winnerTeamId = null;
        if (team1Runs > team2Runs) winnerTeamId = team1Id;
        else if (team2Runs > team1Runs) winnerTeamId = team2Id;

        if (winnerTeamId) {
          await completeMatchWithTeamWinner(match.id, winnerTeamId);
        } else {
          // It's a draw or no winner determined, just set completed
          await supabase.from('match_rooms').update({ status: 'completed' }).eq('id', match.id);
        }
      }

      ctx.onRefresh();
    } catch (err) {
      console.error("Failed to complete match:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRematch = async () => {
    if (isCreatingRematch) return;
    setIsCreatingRematch(true);
    try {
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const { data: newMatch, error: matchError } = await supabase
        .from('match_rooms')
        .insert({
          sport: match.sport,
          room_code: roomCode,
          created_by: currentUser?.id || null,
          status: 'active',
          house_rules: match.house_rules,
          custom_config: match.custom_config,
          custom_game_name: match.custom_game_name,
          is_practice: match.is_practice
        })
        .select()
        .single();
        
      if (matchError) throw matchError;

      // Copy teams
      const teamIdMap = new Map<string, string>(); // old -> new
      if (ctx.teams && ctx.teams.length > 0) {
        for (const team of ctx.teams) {
          const { data: newTeam } = await supabase
            .from('match_teams')
            .insert({
              match_id: newMatch.id,
              team_name: team.team_name,
              team_color: team.team_color,
              sort_order: team.sort_order
            })
            .select()
            .single();
          if (newTeam) {
            teamIdMap.set(team.id, newTeam.id);
          }
        }
      }

      // Copy players
      const matchPlayersToInsert = players.map(p => ({
        match_id: newMatch.id,
        profile_id: p.profile_id,
        role: p.role,
        batting_order: p.batting_order,
        team_id: p.team_id && teamIdMap.has(p.team_id) ? teamIdMap.get(p.team_id) : null
      }));
      
      const { error: playersError } = await supabase
        .from('match_players')
        .insert(matchPlayersToInsert);
        
      if (playersError) throw playersError;

      navigate(`/match/${roomCode}`);
    } catch (err) {
      console.error('Failed to create rematch:', err);
    } finally {
      setIsCreatingRematch(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-charcoal-950 relative">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-charcoal-700 scrollbar-track-transparent pb-[200px]">
        {/* Milestone banner */}
        {milestoneMsg && (
          <div className="bg-warning-500/20 border-b border-warning-500/30 px-4 py-2 text-warning-300 text-center text-sm font-semibold animate-slide-down">
            🏏 {milestoneMsg}
          </div>
        )}

        {/* STACK 1: BATTING SUMMARY & STATS */}
        <div className="flex flex-col bg-charcoal-900/20">
        {/* Broadcast Header Ticker */}
        <div className="relative bg-charcoal-900 border-b-2 border-cricket shadow-2xl z-20">
          <div className="flex flex-col md:flex-row items-stretch min-h-[72px]">
            {/* Team & Score Block / Individual Stats */}
            <div className="flex flex-row md:flex-col justify-center px-6 py-3 md:py-0 border-r border-charcoal-800 bg-gradient-to-br from-charcoal-900 via-charcoal-800 to-charcoal-900 min-w-[200px] relative overflow-hidden group">
              <div className="absolute inset-0 bg-cricket/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              {ctx.isBackyard ? (
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cricket/90 mb-0.5 drop-shadow-sm">
                    {currentBatter1?.display_name || 'Active Batter'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-mono font-black leading-none tracking-tighter text-charcoal-50">
                      {playerStats.get(currentBatter1?.id || '')?.bat_runs ?? 0}
                    </span>
                    <span className="text-2xl font-mono font-bold text-charcoal-500">
                      ({playerStats.get(currentBatter1?.id || '')?.bat_balls ?? 0})
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cricket/90 mb-0.5 drop-shadow-sm">
                    {battingTeam?.team_name || 'Innings 1'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-mono font-black leading-none tracking-tighter text-charcoal-50">
                      {innings?.total_runs ?? 0}
                    </span>
                    <span className="text-2xl font-mono font-bold text-danger-500">
                      -{innings?.wickets ?? 0}
                    </span>
                  </div>
                </div>
              )}
              {/* Mobile Over Info */}
              <div className="md:hidden flex flex-col items-end justify-center">
                <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">Overs</span>
                <span className="text-xl font-mono font-black text-charcoal-50">{overs}</span>
              </div>
            </div>

            {/* Match Stats & Ball History Block */}
            <div className="flex flex-1 items-center px-4 md:px-6 gap-4 md:gap-8 overflow-hidden bg-charcoal-900/50 backdrop-blur-sm">
              {/* Main Stats */}
              <div className="hidden sm:flex gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">Overs</span>
                  <span className="text-lg font-mono font-bold text-charcoal-50 leading-tight">{overs}</span>
                </div>
                {ctx.isBackyard && currentBowler ? (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-success-500 uppercase tracking-wider">{currentBowler.display_name}</span>
                    <span className="text-lg font-mono font-bold text-success-400 leading-tight">
                      {playerStats.get(currentBowler.id)?.bowl_wickets ?? 0}/{playerStats.get(currentBowler.id)?.bowl_runs ?? 0}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">CRR</span>
                    <span className="text-lg font-mono font-bold text-success-400 leading-tight">{crr}</span>
                  </div>
                )}
              </div>

              {/* Vertical Divider */}
              <div className="hidden sm:block w-[1px] h-10 bg-charcoal-800" />

              {/* Recent Balls */}
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-[0.15em]">Recent Deliveries</span>
                  <span className="text-[9px] font-black text-cricket/70 uppercase tracking-widest hidden md:block">
                    Partnership: <span className="text-charcoal-50">{partnership.runs}</span> ({partnership.balls})
                  </span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {recentEvents.length === 0 ? (
                    <div className="text-[10px] text-charcoal-700 font-mono italic">Waiting for first ball...</div>
                  ) : (
                    [...recentEvents].reverse().map((event, i) => {
                      const isWicket = event.event_type === 'wicket';
                      const runs = event.event_data?.runs;
                      const extra = event.event_data?.extra;
                      const label = isWicket ? 'W' : extra ? `${runs}${extra.substring(0, 2).toUpperCase()}` : runs;
                      
                      return (
                        <div
                          key={event.id}
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black font-mono shadow-lg transition-transform hover:scale-110 ${
                            isWicket ? 'bg-danger-600 text-charcoal-50 animate-pulse' :
                            runs === 4 ? 'bg-success-600 text-charcoal-50' :
                            runs === 6 ? 'bg-warning-500 text-charcoal-950' :
                            extra ? 'bg-charcoal-700 text-warning-400 border border-warning-500/30' :
                            'bg-charcoal-800 text-charcoal-300 border border-charcoal-700'
                          }`}
                        >
                          {label}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Extras Block (Mobile Hidden) */}
            <div className="hidden lg:flex items-center px-6 gap-6 border-l border-charcoal-800 bg-charcoal-900/80">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1">Extras</span>
                <div className="flex gap-3 text-[11px] font-mono font-bold">
                  <div className="flex flex-col items-center">
                    <span className="text-charcoal-500 text-[8px]">WD</span>
                    <span className="text-charcoal-200">{innings?.extras_wide || 0}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-charcoal-500 text-[8px]">NB</span>
                    <span className="text-charcoal-200">{innings?.extras_noball || 0}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-charcoal-500 text-[8px]">B</span>
                    <span className="text-charcoal-200">{innings?.extras_bye || 0}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-charcoal-500 text-[8px]">LB</span>
                    <span className="text-charcoal-200">{innings?.extras_legbye || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Match Complete Banner */}
        {(match.status === 'completed' || match.winner_profile_id || match.winner_team_id) && (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center bg-cricket/10 border-b border-cricket/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-cricket/5 to-transparent pointer-events-none" />
            <Trophy size={48} className="text-cricket mb-3 relative z-10" />
            <h2 className="text-2xl font-athletic text-charcoal-50 uppercase tracking-wide relative z-10">Match Complete</h2>
            {match.winner_profile_id && (
              <p className="text-charcoal-300 font-bold mt-1 relative z-10">
                Winner: {profiles.get(match.winner_profile_id)?.display_name || 'Unknown'}
              </p>
            )}
            {match.winner_team_id && (
              <p className="text-charcoal-300 font-bold mt-1 relative z-10">
                Winner: {ctx.teams.find(t => t.id === match.winner_team_id)?.team_name || 'Unknown'}
              </p>
            )}
          </div>
        )}

        {/* Live Batters Tickers (Hidden if match complete) */}
        {match.status !== 'completed' && !match.winner_profile_id && !match.winner_team_id && (
          <div className={`grid ${ctx.isBackyard ? 'grid-cols-1' : 'grid-cols-2'} gap-px bg-charcoal-800/50 border-b border-charcoal-800 relative z-10`}>
            <ActivePlayerOverlay
              label={ctx.isBackyard ? "ACTIVE BATTER" : "STRIKER"}
              profile={currentBatter1}
              players={battingPlayers}
              onChange={id => updateBatter(1, id)}
              stat={currentBatter1 ? playerStats.get(currentBatter1.id) : undefined}
              type="batter"
              isFacing={true}
              disabled={isSpectator}
            />
            {!ctx.isBackyard && (
              <ActivePlayerOverlay
                label="NON-STRIKER"
                profile={currentBatter2}
                players={battingPlayers}
                onChange={id => updateBatter(2, id)}
                stat={currentBatter2 ? playerStats.get(currentBatter2.id) : undefined}
                type="batter"
                disabled={isSpectator}
              />
            )}
          </div>
        )}

        {/* Full Batting Scorecard */}
        <div className="p-4 space-y-3">
          {(isSpectator || isTvDisplayMode) && match.status !== 'completed' && (
            <div className="mb-4 flex flex-col items-center justify-center py-4 bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-danger-500 animate-pulse" />
                <h2 className="text-lg font-black text-charcoal-50 tracking-wide uppercase">Live Broadcast</h2>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-2 px-2">
            <h4 className="text-[10px] font-black text-charcoal-500 uppercase tracking-[0.2em]">Batting Scorecard</h4>
            <div className="flex gap-4">
              <span className="text-[9px] font-bold text-charcoal-600 uppercase">Runs</span>
              <span className="text-[9px] font-bold text-charcoal-600 uppercase">Balls</span>
              <span className="text-[9px] font-bold text-charcoal-600 uppercase hidden sm:block">SR</span>
            </div>
          </div>
          
          <div className="space-y-1.5">
            {battingPlayers.map(p => {
              const stat = playerStats.get(p.id);
              if (!stat && p.id !== innings?.current_batter1_id && p.id !== innings?.current_batter2_id) return null;
              const sr = stat && stat.bat_balls > 0 ? ((stat.bat_runs / stat.bat_balls) * 100).toFixed(1) : '-';
              const isStriker = p.id === innings?.current_batter1_id;
              const isNonStriker = p.id === innings?.current_batter2_id;
              const isAtCrease = isStriker || isNonStriker;
              
              return (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
                  isAtCrease 
                    ? 'bg-charcoal-800 border-l-4 border-cricket shadow-[0_4px_20_rgba(16,185,129,0.1)] scale-[1.02]' 
                    : 'bg-charcoal-900/40 border border-charcoal-800/50 hover:bg-charcoal-800/20'
                } ${stat?.bat_dismissed ? 'opacity-40 grayscale' : ''}`}>
                  <div className="relative">
                    <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
                    {isAtCrease && (
                      <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-charcoal-800 ${isStriker ? 'bg-cricket animate-pulse' : 'bg-charcoal-400'}`} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold truncate ${isAtCrease ? 'text-charcoal-50' : 'text-charcoal-300'}`}>
                        {p.display_name}
                      </span>
                      {isStriker && <span className="text-[10px] font-black text-cricket animate-bounce">🏏</span>}
                    </div>
                    {stat?.bat_dismissed ? (
                      <span className="text-[9px] font-bold text-danger-400/80 uppercase tracking-tight leading-none">
                        {stat.bat_dismissal_method}
                      </span>
                    ) : isAtCrease ? (
                      <span className="text-[9px] font-black text-cricket/80 uppercase tracking-widest leading-none">Not Out</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-6 font-mono">
                    <div className="w-8 text-right">
                      <div className={`text-lg font-black leading-none ${isAtCrease ? 'text-charcoal-50' : 'text-charcoal-200'}`}>{stat?.bat_runs ?? 0}</div>
                    </div>
                    <div className="w-8 text-right">
                      <div className="text-sm font-bold text-charcoal-500 leading-none">{stat?.bat_balls ?? 0}</div>
                    </div>
                    <div className="w-12 text-right hidden sm:block">
                      <div className="text-sm font-bold text-charcoal-600 leading-none">{sr}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* STACK 3: BOWLING STATS (Moved into scrollable area) */}
        <div className="flex flex-col bg-charcoal-900/40">
          {/* Active Bowler Ticker (Hidden if match complete) */}
          {match.status !== 'completed' && !match.winner_profile_id && !match.winner_team_id && (
            <div className="bg-charcoal-800/50 border-b border-charcoal-800">
              <ActivePlayerOverlay
                label="CURRENT BOWLER"
                profile={currentBowler}
                players={bowlingPlayers}
                onChange={updateBowler}
                stat={currentBowler ? playerStats.get(currentBowler.id) : undefined}
                type="bowler"
                disabled={isSpectator}
              />
            </div>
          )}

          {/* Bowling Analysis Table */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-2 px-2">
              <h4 className="text-[10px] font-black text-charcoal-500 uppercase tracking-[0.2em]">Bowling Analysis</h4>
              <div className="flex gap-4">
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-10 text-right">O</span>
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-8 text-right">R</span>
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-8 text-right">W</span>
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-12 text-right hidden sm:block">ECON</span>
              </div>
            </div>
            
            <div className="space-y-1.5">
              {bowlingPlayers.map(p => {
                const stat = playerStats.get(p.id);
                const isCurrent = p.id === innings?.current_bowler_id;
                if (!stat && !isCurrent) return null;
                
                const overs = stat ? `${Math.floor(stat.bowl_balls / 6)}.${stat.bowl_balls % 6}` : '0.0';
                const econ = stat && stat.bowl_balls > 0 ? ((stat.bowl_runs / stat.bowl_balls) * 6).toFixed(2) : '0.00';
                
                return (
                  <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${
                    isCurrent 
                      ? 'bg-charcoal-800 border-l-4 border-success-500 shadow-[0_4px_20px_rgba(34,197,94,0.1)]' 
                      : 'bg-charcoal-900/40 border border-charcoal-800/50 hover:bg-charcoal-800/20'
                  }`}>
                    <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold truncate ${isCurrent ? 'text-charcoal-50' : 'text-charcoal-300'}`}>
                          {p.display_name}
                        </span>
                        {isCurrent && <span className="text-[10px] font-black text-success-500 uppercase tracking-widest animate-pulse">Bowling</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 font-mono">
                      <div className="w-10 text-right">
                        <div className={`text-sm font-bold leading-none ${isCurrent ? 'text-charcoal-50' : 'text-charcoal-200'}`}>{overs}</div>
                      </div>
                      <div className="w-8 text-right">
                        <div className="text-sm font-bold text-charcoal-400 leading-none">{stat?.bowl_runs ?? 0}</div>
                      </div>
                      <div className="w-8 text-right">
                        <div className="text-lg font-black text-danger-400 leading-none">{stat?.bowl_wickets ?? 0}</div>
                      </div>
                      <div className="w-12 text-right hidden sm:block">
                        <div className="text-sm font-bold text-charcoal-600 leading-none">{econ}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>
      </div>

      {/* STACK 2: FIXED SCORING UI CONTROLS OR REMATCH ACTIONS (Pinned to bottom) */}
      {(match.status === 'completed' || match.winner_profile_id || match.winner_team_id) ? (
        <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom z-30">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={handleRematch}
              disabled={isCreatingRematch}
              className="btn-primary py-3 flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              Rematch
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-secondary py-3 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={18} />
              Dashboard
            </button>
          </div>
        </div>
      ) : (
        !isSpectator && !isTvDisplayMode && (match.status === 'active' || isAdmin) && (
          <div className="absolute bottom-0 left-0 right-0 py-2 px-3 safe-bottom z-30">
            <div className="flex flex-col gap-2 max-w-2xl mx-auto">
              {/* Run buttons */}
            <div className="grid grid-cols-6 gap-1.5">
              {[0, 1, 2, 3, 4, 6].map(r => (
                <button
                  key={r}
                  onClick={() => handleDelivery(r)}
                  disabled={loading || !currentBatter1}
                  className={`score-btn font-mono font-black text-lg h-12 ${
                    r === 4 ? 'border-success-600/50 text-success-400 bg-success-600/5' :
                    r === 6 ? 'border-warning-500/50 text-warning-400 bg-warning-500/5' : 
                    'bg-charcoal-800/50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {/* Extra/Wicket buttons */}
            <div className="grid grid-cols-5 gap-1.5">
              {['Wide', 'No Ball', 'Bye', 'Leg Bye'].map(extra => (
                <button
                  key={extra}
                  onClick={() => handleDelivery(extra === 'Wide' || extra === 'No Ball' ? 1 : 1,
                    extra.toLowerCase().replace(' ', '') as 'wide' | 'noball' | 'bye' | 'legbye')}
                  disabled={loading || !currentBatter1}
                  className="score-btn text-[9px] text-warning-300 border-warning-600/30 h-10 bg-charcoal-800/30 uppercase font-black tracking-tighter"
                >
                  {extra}
                </button>
              ))}
              <button
                onClick={() => setShowWicketModal(true)}
                disabled={loading || !currentBatter1 || !currentBowler}
                className="score-btn bg-danger-900/40 border-danger-600/50 text-danger-400 font-black text-[9px] h-10 uppercase"
              >
                WICKET
              </button>
            </div>
            {/* Undo + Switch Innings */}
            <div className="flex gap-2">
              <button
                onClick={handleUndo}
                disabled={loading}
                className="btn-secondary flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-charcoal-800 h-9"
              >
                Undo Ball
              </button>
              <button
                onClick={switchInnings}
                disabled={loading}
                className="btn-secondary flex-none px-4 py-2 text-[10px] font-black uppercase tracking-widest text-accent-400 border-accent-500/20 bg-accent-500/5 h-9"
              >
                Innings →
              </button>
            </div>
          </div>
        </div>
        )
      )}

      {/* Next Batter Modal (Backyard Mode) */}
      <Modal isOpen={showNextBatterModal} onClose={() => setShowNextBatterModal(false)} title="Next Batter">
        <div className="flex flex-col items-center justify-center p-6 space-y-4">
          <Avatar 
            name={profiles.get(nextBatterProfileId || '')?.display_name || ''} 
            color={profiles.get(nextBatterProfileId || '')?.avatar_color || '#ccc'} 
            size="lg" 
          />
          <h2 className="text-2xl font-black text-charcoal-50">
            {profiles.get(nextBatterProfileId || '')?.display_name}
          </h2>
          <p className="text-charcoal-300 text-sm uppercase tracking-widest font-bold">is up to bat!</p>
          
          <button 
            onClick={() => setShowNextBatterModal(false)}
            className="btn-primary w-full mt-4 py-3"
          >
            Ready
          </button>
        </div>
      </Modal>

      {/* Wicket Modal */}
      <Modal isOpen={showWicketModal} onClose={() => setShowWicketModal(false)} title="Wicket!">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
              Method of Dismissal
            </label>
            <select
              value={wicketData.method}
              onChange={e => setWicketData(d => ({ ...d, method: e.target.value as DismissalMethod }))}
              className="input-field"
            >
              {(['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket', 'Caught & Bowled'] as DismissalMethod[]).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          {(['Caught', 'Run Out', 'Stumped', 'Caught & Bowled'].includes(wicketData.method)) && (
            <div>
              <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
                Fielded By
              </label>
              <select
                value={wicketData.fieldedBy}
                onChange={e => setWicketData(d => ({ ...d, fieldedBy: e.target.value }))}
                className="input-field"
              >
                <option value="">Select player...</option>
                {[...battingPlayers, ...bowlingPlayers].map(p => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setShowWicketModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleWicket} disabled={loading} className="btn-danger flex-1">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Confirm Wicket'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bowler Rotation Modal */}
      <Modal isOpen={showBowlerModal} onClose={() => setShowBowlerModal(false)} title="Over Complete!">
        <div className="space-y-4">
          <p className="text-charcoal-300 text-sm text-center">
            The over has ended. Please select the next bowler.
          </p>
          <div>
            <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
              Next Bowler
            </label>
            <select
              value={innings?.current_bowler_id || ''}
              onChange={e => updateBowler(e.target.value)}
              className="input-field"
            >
              <option value="">Select bowler...</option>
              {bowlingPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => setShowBowlerModal(false)} 
            disabled={!innings?.current_bowler_id}
            className="btn-primary w-full"
          >
            Confirm Bowler
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ActivePlayerOverlay({
  label, profile, players, onChange, stat, type, isFacing, disabled
}: {
  label: string;
  profile: Profile | null | undefined;
  players: Profile[];
  onChange: (id: string) => void;
  stat?: CricketPlayerStats;
  type: 'batter' | 'bowler';
  isFacing?: boolean;
  disabled: boolean;
}) {
  const sr = stat && stat.bat_balls > 0 ? ((stat.bat_runs / stat.bat_balls) * 100).toFixed(1) : '0.0';
  const econ = stat && stat.bowl_balls > 0 ? ((stat.bowl_runs / stat.bowl_balls) * 6).toFixed(2) : '0.00';

  return (
    <div className={`relative flex items-center justify-between px-4 py-3 border-r border-charcoal-800/50 transition-all ${isFacing ? 'bg-cricket/5' : 'bg-transparent hover:bg-charcoal-800/30'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative">
          <Avatar name={profile?.display_name || '?'} color={profile?.avatar_color || 'bg-charcoal-700'} size="sm" />
          {isFacing && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cricket rounded-full border-2 border-charcoal-900 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          )}
        </div>
        
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest leading-none mb-1">{label}</span>
          <select
            value={profile?.id || ''}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className="bg-transparent text-sm font-black text-charcoal-50 border-none p-0 focus:ring-0 cursor-pointer hover:text-cricket transition-colors w-full truncate appearance-none"
          >
            <option value="">SELECT PLAYER</option>
            {players.map(p => (
              <option key={p.id} value={p.id} className="bg-charcoal-900">{p.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      {stat && (
        <div className="flex items-center gap-4 pl-4 border-l border-charcoal-800/50">
          {type === 'batter' ? (
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-black text-charcoal-50 leading-none">{stat.bat_runs}</span>
                <span className="text-[10px] font-mono font-bold text-charcoal-500">({stat.bat_balls})</span>
              </div>
              <span className="text-[8px] font-black text-charcoal-600 uppercase tracking-tighter mt-1">SR: <span className="text-cricket/80">{sr}</span></span>
            </div>
          ) : (
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-black text-success-400 leading-none">{stat.bowl_wickets}/{stat.bowl_runs}</span>
              </div>
              <span className="text-[8px] font-black text-charcoal-600 uppercase tracking-tighter mt-1">ECON: <span className="text-success-500/80">{econ}</span></span>
            </div>
          )}
        </div>
      )}

      {isFacing && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cricket" />}
    </div>
  );
}
