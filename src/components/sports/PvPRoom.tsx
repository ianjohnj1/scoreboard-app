import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Target, Trophy, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { completeMatchWithTeamWinner, recordEvent, undoLastEvent } from '../../lib/matches';
import UserAvatar from '../UserAvatar';
import Modal from '../Modal';
import TieBreakerChallenge from '../TieBreakerChallenge';
import { useNavigate } from 'react-router-dom';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { MatchEvent, Profile, PlayerCareerAnalytics } from '../../lib/supabase';

type PvPRules = {
  starting_balls_per_team?: number;
};

type TeamRuntime = {
  teamId: string;
  teamName: string;
  teamColor: string;
  score: number;
  attempts: number;
  lineup: Profile[];
};

export default function PvPRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode, onRefresh } = ctx;
  const rules = (match.house_rules || {}) as PvPRules;
  const startingBalls = Math.max(1, Number(rules.starting_balls_per_team || 5));

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTieBreaker, setShowTieBreaker] = useState(false);
  const [analytics, setAnalytics] = useState<Map<string, PlayerCareerAnalytics>>(new Map());
  const isMountedRef = useRef(true);
  const resolvedWinnerRef = useRef(false);
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const teamLineups = useMemo(() => {
    const output = new Map<string, Profile[]>();

    teams.forEach(team => {
      const lineup = players
        .filter(player => player.team_id === team.id)
        .sort((a, b) => {
          const aOrder = a.lineup_order ?? a.batting_order ?? 999;
          const bOrder = b.lineup_order ?? b.batting_order ?? 999;
          return aOrder - bOrder;
        })
        .map(player => profiles.get(player.profile_id))
        .filter(Boolean) as Profile[];

      output.set(team.id, lineup);
    });

    return output;
  }, [players, profiles, teams]);

  const orderedTeams = useMemo(() => [...teams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [teams]);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', match.id)
      .eq('is_undone', false)
      .order('sequence_num', { ascending: true });

    if (!isMountedRef.current) return;
    if (error) {
      console.error('Error loading PvP events:', error);
      return;
    }

    setEvents(data || []);
  }, [match.id]);

  const loadAnalytics = useCallback(async () => {
    const profileIds = players.map(player => player.profile_id);
    if (profileIds.length === 0) return;

    const { data, error } = await supabase
      .from('player_career_analytics')
      .select('*')
      .eq('sport', 'putt_vs_putt')
      .eq('is_practice', match.is_practice)
      .in('profile_id', profileIds);

    if (!isMountedRef.current) return;
    if (error) {
      console.error('Error loading PvP analytics:', error);
      return;
    }

    setAnalytics(new Map((data || []).map(row => [row.profile_id, row as PlayerCareerAnalytics])));
  }, [match.is_practice, players]);

  useEffect(() => {
    loadEvents();
    loadAnalytics();
  }, [loadAnalytics, loadEvents]);

  useEffect(() => {
    const channel = supabase
      .channel(`pvp:${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` }, () => loadEvents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_career_stats' }, () => loadAnalytics())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAnalytics, loadEvents, match.id]);

  const isMatchComplete = match.status === 'completed' || Boolean(match.winner_team_id);
  const isBroadcastView = !isMatchComplete && (isSpectator || isTvDisplayMode);

  const puttAttemptEvents = useMemo(
    () => events.filter(event => event.event_type === 'putt_attempt'),
    [events]
  );

  const tieBreakResult = useMemo(
    () => events.find(event => event.event_type === 'tiebreak_result') || null,
    [events]
  );

  const matchPlayerStats = useMemo(() => {
    const output = new Map<string, { attempts: number; holed: number }>();
    puttAttemptEvents.forEach(event => {
      const playerId = event.player_id;
      if (!playerId) return;
      const existing = output.get(playerId) || { attempts: 0, holed: 0 };
      existing.attempts += 1;
      if (event.event_data.outcome === 'holed') {
        existing.holed += 1;
      }
      output.set(playerId, existing);
    });
    return output;
  }, [puttAttemptEvents]);

  const teamRuntime = useMemo<TeamRuntime[]>(() => {
    return orderedTeams.map(team => {
      const lineup = teamLineups.get(team.id) || [];
      const attempts = puttAttemptEvents.filter(event => event.team_id === team.id).length;
      const score = puttAttemptEvents.filter(
        event => event.team_id === team.id && event.event_data.outcome === 'holed'
      ).length;

      return {
        teamId: team.id,
        teamName: team.team_name,
        teamColor: team.team_color,
        score,
        attempts,
        lineup,
      };
    });
  }, [orderedTeams, puttAttemptEvents, teamLineups]);

  const turnState = useMemo(() => {
    const teamIds = orderedTeams.map(team => team.id);
    const team0 = teamIds[0] || null;
    const team1 = teamIds[1] || null;
    if (!team0 || !team1) {
      return {
        poolRemaining: 0,
        activeTeamId: null as string | null,
        activePlayerId: null as string | null,
        attemptIndex: 0,
        attemptTarget: 0,
      };
    }

    let pool = startingBalls;
    const teamTurnCounts: Record<string, number> = { [team0]: 0, [team1]: 0 };
    const teamPlayerIndex: Record<string, number> = { [team0]: 0, [team1]: 0 };
    let activeTeamIndex = 0;
    let attemptTarget = pool;
    let attemptIndex = 0;

    const getActiveTeamId = () => teamIds[activeTeamIndex] || null;
    const advancePlayerForTeam = (teamId: string) => {
      const lineup = teamLineups.get(teamId) || [];
      if (lineup.length <= 1) return;
      teamPlayerIndex[teamId] = (teamPlayerIndex[teamId] + 1) % lineup.length;
    };

    for (const event of puttAttemptEvents) {
      if (pool <= 0) break;
      attemptIndex += 1;
      if (event.event_data.outcome === 'holed') {
        pool = Math.max(0, pool - 1);
      }

      if (attemptIndex >= attemptTarget) {
        const finishedTeamId = getActiveTeamId();
        if (finishedTeamId) {
          teamTurnCounts[finishedTeamId] = (teamTurnCounts[finishedTeamId] || 0) + 1;
        }

        activeTeamIndex = 1 - activeTeamIndex;
        const nextTeamId = getActiveTeamId();
        if (nextTeamId && (teamTurnCounts[nextTeamId] || 0) > 0) {
          advancePlayerForTeam(nextTeamId);
        }

        attemptIndex = 0;
        attemptTarget = pool;
      }
    }

    const activeTeamId = getActiveTeamId();
    const activeLineup = activeTeamId ? teamLineups.get(activeTeamId) || [] : [];
    const activePlayerId = activeTeamId && activeLineup.length > 0
      ? activeLineup[teamPlayerIndex[activeTeamId] || 0]?.id || null
      : null;

    return {
      poolRemaining: pool,
      activeTeamId,
      activePlayerId,
      attemptIndex,
      attemptTarget,
    };
  }, [orderedTeams, puttAttemptEvents, startingBalls, teamLineups]);

  const remainingPool = turnState.poolRemaining;
  const activeTeam = turnState.activeTeamId ? teamRuntime.find(team => team.teamId === turnState.activeTeamId) || null : null;
  const activePlayer = activeTeam && activeTeam.lineup.length > 0 && turnState.activePlayerId
    ? activeTeam.lineup.find(player => player.id === turnState.activePlayerId) || null
    : null;

  const matchIsTied = teamRuntime.length === 2 && teamRuntime[0].score === teamRuntime[1].score;
  const canInteract = !isSpectator && !isTvDisplayMode && (match.status === 'active' || isAdmin);

  useEffect(() => {
    if (match.status !== 'active') return;
    if (!canInteract || remainingPool !== 0 || resolvedWinnerRef.current || tieBreakResult) return;

    if (teamRuntime.length === 2 && !matchIsTied) {
      const winner = teamRuntime[0].score > teamRuntime[1].score ? teamRuntime[0] : teamRuntime[1];
      resolvedWinnerRef.current = true;
      completeMatchWithTeamWinner(match.id, winner.teamId)
        .then(() => onRefresh())
        .catch(error => {
          resolvedWinnerRef.current = false;
          console.error('Failed to complete PvP match:', error);
        });
      return;
    }

    if (teamRuntime.length === 2 && matchIsTied) {
      setShowTieBreaker(true);
    }
  }, [canInteract, match.id, match.status, matchIsTied, onRefresh, remainingPool, teamRuntime, tieBreakResult]);

  const handleAttempt = async (outcome: 'holed' | 'missed') => {
    if (!canInteract || !activeTeam || !activePlayer || remainingPool === 0) return;

    setLoading(true);
    try {
      await recordEvent(
        match.id,
        'putt_attempt',
        {
          turn_number: puttAttemptEvents.length + 1,
          putting_team_id: activeTeam.teamId,
          putting_player_id: activePlayer.id,
          outcome,
        },
        activePlayer.id,
        activeTeam.teamId,
        currentUser?.id
      );

      await loadEvents();
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!canInteract || loading || puttAttemptEvents.length === 0) return;

    setLoading(true);
    try {
      resolvedWinnerRef.current = false;
      await undoLastEvent(match.id);
      await loadEvents();
      if (match.status !== 'completed') {
        setShowTieBreaker(false);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleRematch = async () => {
    if (isCreatingRematch) return;
    setIsCreatingRematch(true);
    try {
      const roomCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
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
          is_practice: match.is_practice,
        })
        .select()
        .single();

      if (matchError) throw matchError;

      const teamIdMap = new Map<string, string>();
      const { data: newTeams, error: teamsError } = await supabase
        .from('match_teams')
        .insert(
          orderedTeams.map(team => ({
            match_id: newMatch.id,
            team_name: team.team_name,
            team_color: team.team_color,
            sort_order: team.sort_order,
          }))
        )
        .select();

      if (teamsError) throw teamsError;

      const sortedNewTeams = [...(newTeams || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      orderedTeams.forEach((oldTeam, index) => {
        const newTeam = sortedNewTeams[index];
        if (newTeam?.id) {
          teamIdMap.set(oldTeam.id, newTeam.id);
        }
      });

      const { error: playersError } = await supabase.from('match_players').insert(
        players.map(player => ({
          match_id: newMatch.id,
          profile_id: player.profile_id,
          role: player.role,
          team_id: player.team_id ? teamIdMap.get(player.team_id) || null : null,
          batting_order: player.batting_order,
          lineup_order: player.lineup_order,
        }))
      );

      if (playersError) throw playersError;

      navigate(`/match/${roomCode}`);
    } catch (error) {
      console.error('Failed to create rematch:', error);
    } finally {
      setIsCreatingRematch(false);
    }
  };

  const handleTieBreakConfirm = async ({
    winningTeamId,
    winningPlayerId,
  }: {
    winningTeamId: string;
    winningPlayerId: string;
  }) => {
    setLoading(true);
    try {
      await recordEvent(
        match.id,
        'tiebreak_result',
        {
          representative_player_id: winningPlayerId,
          winning_team_id: winningTeamId,
        },
        winningPlayerId,
        winningTeamId,
        currentUser?.id
      );

      await completeMatchWithTeamWinner(match.id, winningTeamId);
      setShowTieBreaker(false);
      await loadEvents();
      onRefresh();
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  if (teams.length !== 2) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-charcoal-400">
        PvP requires exactly two teams to start.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-charcoal-700 bg-charcoal-800 px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {teamRuntime.map(team => (
            <div key={team.teamId} className="rounded-2xl border border-charcoal-700 bg-charcoal-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-charcoal-500">Score</p>
                  <h2 className="text-lg font-black" style={{ color: team.teamColor }}>
                    {team.teamName}
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black text-charcoal-50">{team.score}</p>
                  <p className="text-xs text-charcoal-500">{team.attempts} attempts</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-charcoal-700 bg-charcoal-900/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-charcoal-500">Balls Remaining</p>
            <p className="text-2xl font-black text-charcoal-50">{remainingPool}</p>
          </div>
          <div className="rounded-xl border border-charcoal-700 bg-charcoal-900/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-charcoal-500">Current Turn</p>
            <p className="text-sm font-bold text-charcoal-100">
              {remainingPool === 0
                ? tieBreakResult
                  ? `${teams.find(team => team.id === tieBreakResult.event_data.winning_team_id)?.team_name || 'Winner'} wins tie-break`
                  : matchIsTied
                    ? 'Tie-break required'
                    : 'Match complete'
                : `${activeTeam?.teamName || '--'} • ${activePlayer?.display_name || '--'}`}
            </p>
          </div>
        </div>

        {remainingPool > 0 && activePlayer && (
          <div className="mt-3 rounded-2xl border border-charcoal-700 bg-charcoal-900/40 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Attempts This Turn</p>
                <p className="text-sm font-bold text-charcoal-100">
                  Attempt {Math.min(turnState.attemptIndex + 1, turnState.attemptTarget)}<span className="text-charcoal-600 text-xs">/{turnState.attemptTarget}</span>
                </p>
              </div>
              <div className="flex gap-1 justify-end">
                {Array.from({ length: turnState.attemptTarget }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full border ${
                      i < turnState.attemptIndex ? 'bg-success-500 border-success-400' : 'bg-charcoal-800 border-charcoal-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isMatchComplete ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
            <Trophy size={48} className="text-success-500 mb-4" />
            <h2 className="text-2xl font-black text-charcoal-50 mb-6">
              Match Complete
            </h2>

            <div className="w-full space-y-3">
              {teamRuntime
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((team, idx) => (
                  <div key={team.teamId} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">{idx + 1}</div>
                      <div className="w-10 h-10 rounded-xl bg-charcoal-700 flex items-center justify-center text-xl flex-shrink-0" style={{ color: team.teamColor }}>
                        ⛳
                      </div>
                      <span className="font-bold text-charcoal-100 flex-1 truncate">{team.teamName}</span>
                      <span className="font-mono text-xl font-black text-charcoal-50">{team.score}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] font-bold text-charcoal-500 uppercase tracking-widest">Attempts</p>
                        <p className="font-mono text-base font-black text-charcoal-200">{team.attempts}</p>
                      </div>
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-success-500/20">
                        <p className="text-[9px] font-bold text-success-500 uppercase tracking-widest">Holed</p>
                        <p className="font-mono text-base font-black text-success-400">{team.score}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {team.lineup.map(player => {
                        const matchStats = matchPlayerStats.get(player.id) || { attempts: 0, holed: 0 };
                        const matchPct = matchStats.attempts > 0 ? (matchStats.holed / matchStats.attempts) * 100 : 0;
                        const career = analytics.get(player.id);
                        const careerPct = career?.career_pct_holed ?? 0;
                        const clutchWins = career?.clutch_putts ?? 0;

                        return (
                          <div key={player.id} className="rounded-2xl border border-charcoal-700 bg-charcoal-900/40 p-3">
                            <div className="flex items-center gap-3">
                              <UserAvatar
                                display_name={player.display_name}
                                avatar_color={player.avatar_color}
                                avatar_url={player.avatar_url}
                                size="sm"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-charcoal-100 truncate">{player.display_name}</p>
                                <p className="text-[10px] uppercase tracking-widest text-charcoal-500">
                                  {matchStats.holed}/{matchStats.attempts} holed
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-black text-charcoal-50">{matchPct.toFixed(1)}%</p>
                                <p className="text-[10px] uppercase tracking-widest text-charcoal-500">Match</p>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-xl border border-charcoal-700 bg-charcoal-800/50 p-2">
                                <p className="text-[9px] uppercase tracking-widest text-charcoal-500">Career %</p>
                                <p className="text-base font-black text-charcoal-100">{careerPct.toFixed(1)}%</p>
                              </div>
                              <div className="rounded-xl border border-charcoal-700 bg-charcoal-800/50 p-2">
                                <p className="text-[9px] uppercase tracking-widest text-charcoal-500">Clutch Wins</p>
                                <p className="text-base font-black text-charcoal-100">{clutchWins}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>

            {!isSpectator && !isTvDisplayMode && (
              <div className="w-full max-w-sm mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  Dashboard
                </button>
              </div>
            )}
          </div>
        ) : isBroadcastView ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-charcoal-700 bg-charcoal-900/30 p-4">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" />
                <h2 className="text-lg font-black text-charcoal-50 tracking-wide uppercase">Live Broadcast</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {teamRuntime.map(team => {
                const pct = team.attempts > 0 ? (team.score / team.attempts) * 100 : 0;
                const isActive = remainingPool > 0 && team.teamId === activeTeam?.teamId;

                return (
                  <div
                    key={team.teamId}
                    className={`rounded-2xl border p-4 transition-colors ${
                      isActive
                        ? 'border-success-500/40 bg-success-500/10'
                        : 'border-charcoal-700 bg-charcoal-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Team</p>
                        <p className="text-lg font-black truncate" style={{ color: team.teamColor }}>
                          {team.teamName}
                        </p>
                        <p className="text-[11px] text-charcoal-400">
                          {team.score}/{team.attempts} holed • {pct.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Score</p>
                        <p className="font-mono text-3xl font-black text-charcoal-50">{team.score}</p>
                      </div>
                    </div>

                    {isActive && activePlayer && (
                      <div className="mt-3 rounded-xl border border-charcoal-700 bg-charcoal-800/40 px-3 py-2">
                        <p className="text-[9px] uppercase tracking-widest text-charcoal-500">Putting</p>
                        <p className="text-sm font-bold text-charcoal-100 truncate">{activePlayer.display_name}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {teamRuntime.map(team => (
                <div key={team.teamId} className="rounded-2xl border border-charcoal-700 bg-charcoal-900/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-widest" style={{ color: team.teamColor }}>
                      {team.teamName}
                    </p>
                    <p className="text-xs text-charcoal-500">{team.lineup.length} players</p>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {team.lineup.map(player => {
                      const matchStats = matchPlayerStats.get(player.id) || { attempts: 0, holed: 0 };
                      const missed = Math.max(0, matchStats.attempts - matchStats.holed);
                      const pct = matchStats.attempts > 0 ? (matchStats.holed / matchStats.attempts) * 100 : 0;

                      return (
                        <div key={player.id} className="rounded-2xl border border-charcoal-700 bg-charcoal-800/30 p-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              display_name={player.display_name}
                              avatar_color={player.avatar_color}
                              avatar_url={player.avatar_url}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-charcoal-100 truncate">{player.display_name}</p>
                              <p className="text-[10px] uppercase tracking-widest text-charcoal-500">
                                {matchStats.holed}/{matchStats.attempts} holed • {missed} missed
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-charcoal-50">{pct.toFixed(1)}%</p>
                              <p className="text-[10px] uppercase tracking-widest text-charcoal-500">Match</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          teamRuntime.map(team => (
          <div key={team.teamId} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users size={16} style={{ color: team.teamColor }} />
              <h3 className="font-bold text-charcoal-100">{team.teamName} Lineup</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {team.lineup.map(player => {
                const career = analytics.get(player.id);
                const winRate = career && career.matches_played > 0
                  ? Math.round((career.matches_won / career.matches_played) * 100)
                  : 0;
                const holedPct = career?.career_pct_holed ?? 0;
                const isCurrent = activePlayer?.id === player.id && activeTeam?.teamId === team.teamId && remainingPool > 0;

                return (
                  <div
                    key={player.id}
                    className={`rounded-2xl border p-3 transition-colors ${
                      isCurrent
                        ? 'border-success-500/40 bg-success-500/10'
                        : 'border-charcoal-700 bg-charcoal-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        display_name={player.display_name}
                        avatar_color={player.avatar_color}
                        avatar_url={player.avatar_url}
                        size="sm"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-charcoal-100">{player.display_name}</p>
                        <p className="text-[11px] uppercase tracking-wider text-charcoal-500">
                          Lineup #{team.lineup.findIndex(item => item.id === player.id) + 1}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="rounded-full border border-success-500/30 bg-success-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-success-400">
                          Putting
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-charcoal-700 bg-charcoal-800/50 p-2">
                        <p className="text-[10px] uppercase tracking-widest text-charcoal-500">Wins</p>
                        <p className="text-lg font-black text-charcoal-100">{career?.matches_won ?? 0}</p>
                        <p className="text-[10px] text-charcoal-500">{winRate}% win rate</p>
                      </div>
                      <div className="rounded-xl border border-charcoal-700 bg-charcoal-800/50 p-2">
                        <p className="text-[10px] uppercase tracking-widest text-charcoal-500">% Holed</p>
                        <p className="text-lg font-black text-charcoal-100">{holedPct.toFixed(1)}%</p>
                        <p className="text-[10px] text-charcoal-500">
                          {career?.holed_putts_total ?? 0} career holes
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )))}
      </div>

      {!isSpectator && !isTvDisplayMode && (
        <div className="border-t border-charcoal-700 bg-charcoal-800/95 p-4">
          {remainingPool > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={handleUndo}
                disabled={loading || puttAttemptEvents.length === 0}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Undo
              </button>
              <button
                type="button"
                onClick={() => handleAttempt('missed')}
                disabled={loading || !canInteract}
                className="rounded-xl border border-charcoal-600 bg-charcoal-900 px-4 py-3 text-sm font-bold text-charcoal-200 transition-colors hover:bg-charcoal-700"
              >
                Missed
              </button>
              <button
                type="button"
                onClick={() => handleAttempt('holed')}
                disabled={loading || !canInteract}
                className="btn-success flex items-center justify-center gap-2"
              >
                <Target size={16} />
                Holed
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-warning-200">
              {matchIsTied && !tieBreakResult
                ? 'Pool is empty and the teams are tied. Start the Putt Off tie-breaker.'
                : 'Pool is empty. Match result is locked in.'}
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={showTieBreaker && !tieBreakResult && !isSpectator}
        onClose={() => setShowTieBreaker(false)}
        title="Putt Off Tie-Breaker"
      >
        <TieBreakerChallenge
          teams={teams}
          teamPlayers={teamLineups}
          onCancel={() => setShowTieBreaker(false)}
          onConfirm={handleTieBreakConfirm}
          loading={loading}
        />
      </Modal>
    </div>
  );
}
