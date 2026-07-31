import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent, undoLastEvent, completeMatchWithWinner, completeMatchWithTeamWinner, generateRoomCode } from '../../lib/matches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import UserAvatar from '../UserAvatar';
import Modal from '../Modal';
import { useNavigate } from 'react-router-dom';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile, MatchEvent, MatchTeam } from '../../lib/supabase';
import { Trophy, Star, RotateCcw, AlertCircle, ArrowLeft, Users } from 'lucide-react';

interface ChipOffRules {
  balls_per_turn?: number;
  total_rounds?: number;
  hazard_penalty?: boolean;
  team_play?: boolean;
}

export default function ChipOffRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, teams, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;
  const canInteract = match.status === 'active' || isAdmin;
  const rules = (match.house_rules || {}) as ChipOffRules;
  const ballsPerTurn = rules.balls_per_turn || 3;
  const totalRounds = rules.total_rounds || 9;
  const hazardPenalty = rules.hazard_penalty || false;
  const isTeamMode = Boolean(rules.team_play) && teams.length >= 2;

  const { events, loading: eventsLoading, refresh: refreshEvents } = useMatchEvents(match.id);
  const [loading, setLoading] = useState(false);
  const [showRoundWinner, setShowRoundWinner] = useState(false);
  const [roundWinnerName, setRoundWinnerName] = useState('');
  const navigate = useNavigate();
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);

  const matchPlayers = useMemo(() =>
    players
      .map(p => profiles.get(p.profile_id))
      .filter(Boolean) as Profile[]
  , [players, profiles]);

  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [teams]
  );

  const teamLineups = useMemo(() => {
    const map = new Map<string, Profile[]>();
    orderedTeams.forEach(team => {
      const lineup = players
        .filter(p => p.team_id === team.id)
        .sort((a, b) => (a.lineup_order ?? a.batting_order ?? 999) - (b.lineup_order ?? b.batting_order ?? 999))
        .map(p => profiles.get(p.profile_id))
        .filter(Boolean) as Profile[];
      map.set(team.id, lineup);
    });
    return map;
  }, [players, profiles, orderedTeams]);

  // Turn order: when team_play is on, interleave each team's lineup by
  // position (Team A P1, Team B P1, Team A P2, Team B P2, ...), skipping a
  // team once its lineup runs out so uneven roster sizes degrade gracefully.
  const rotation = useMemo(() => {
    if (!isTeamMode) return matchPlayers.map(p => ({ profile: p, teamId: null as string | null }));
    const lineups = orderedTeams.map(t => teamLineups.get(t.id) || []);
    const maxLen = Math.max(0, ...lineups.map(l => l.length));
    const order: { profile: Profile; teamId: string }[] = [];
    for (let i = 0; i < maxLen; i++) {
      orderedTeams.forEach((team, idx) => {
        const player = lineups[idx][i];
        if (player) order.push({ profile: player, teamId: team.id });
      });
    }
    return order;
  }, [isTeamMode, orderedTeams, teamLineups, matchPlayers]);

  const rotationPlayers = useMemo(() => rotation.map(r => r.profile), [rotation]);

  // Game Logic Derived State
  const gameStats = useMemo(() => {
    const stats = new Map<string, { totalPoints: number; tens: number; fives: number; twos: number; misses: number; hazards: number; chips: number; roundScores: number[] }>();
    matchPlayers.forEach(p => stats.set(p.id, { totalPoints: 0, tens: 0, fives: 0, twos: 0, misses: 0, hazards: 0, chips: 0, roundScores: Array(totalRounds).fill(0) }));

    let lastScoreEvent: MatchEvent | null = null;

    for (const event of events) {
      if (event.event_type === 'chip_off_score') {
        const pId = event.player_id!;
        const points = (event.event_data.points as number) || 0;
        const round = (event.event_data.round as number) || 1;
        const playerStat = stats.get(pId);
        if (playerStat) {
          playerStat.totalPoints += points;
          playerStat.chips += 1;
          if (points === 10) playerStat.tens += 1;
          else if (points === 5) playerStat.fives += 1;
          else if (points === 2) playerStat.twos += 1;
          else if (points === 0) playerStat.misses += 1;
          else if (points === -1) playerStat.hazards += 1;

          // Bucket by the round recorded on the event itself, not a replayed
          // counter, so a roster change mid-match can't reassign past scores.
          if (round >= 1 && round <= totalRounds) {
            playerStat.roundScores[round - 1] += points;
          }
        }

        lastScoreEvent = event;
      }
    }

    // Derive the upcoming turn from the last recorded event + today's roster,
    // instead of replaying the whole history against today's player count.
    let currentRound = 1;
    let currentPlayerIndex = 0;
    let currentBallIndex = 0;

    if (lastScoreEvent) {
      const lastRound = (lastScoreEvent.event_data.round as number) || 1;
      const lastBall = (lastScoreEvent.event_data.ball as number) || 1;
      const lastPlayerIdx = rotationPlayers.findIndex(p => p.id === lastScoreEvent.player_id);

      currentRound = lastRound;
      currentPlayerIndex = lastPlayerIdx === -1 ? 0 : lastPlayerIdx;
      currentBallIndex = lastBall;

      if (currentBallIndex >= ballsPerTurn) {
        currentBallIndex = 0;
        currentPlayerIndex++;
        if (currentPlayerIndex >= rotationPlayers.length) {
          currentPlayerIndex = 0;
          currentRound++;
        }
      }
    }

    return {
      stats,
      currentRound: Math.min(currentRound, totalRounds),
      currentPlayerIndex,
      currentBallIndex,
      isGameOver: currentRound > totalRounds
    };
  }, [events, matchPlayers, rotationPlayers, ballsPerTurn, totalRounds]);

  const currentEntry = rotation[gameStats.currentPlayerIndex];
  const currentPlayer = currentEntry?.profile;
  const currentTeamId = currentEntry?.teamId ?? undefined;
  const isMyTurn = !isSpectator && currentUser?.id === currentPlayer?.id;

  const teamTotals = useMemo(() => {
    if (!isTeamMode) return [] as { team: MatchTeam; total: number }[];
    return orderedTeams.map(team => {
      const memberIds = players.filter(p => p.team_id === team.id).map(p => p.profile_id);
      const total = memberIds.reduce((sum, pid) => sum + (gameStats.stats.get(pid)?.totalPoints || 0), 0);
      return { team, total };
    });
  }, [isTeamMode, orderedTeams, players, gameStats.stats]);

  const handleScore = async (points: number) => {
    if (!currentPlayer || loading || eventsLoading || isSpectator || !canInteract) return;
    setLoading(true);
    try {
      await recordEvent(
        match.id,
        'chip_off_score',
        { points, round: gameStats.currentRound, ball: gameStats.currentBallIndex + 1 },
        currentPlayer.id,
        currentTeamId,
        currentUser?.id
      );

      // Check if this was the last ball of the round
      const willBeLastBall = gameStats.currentBallIndex === ballsPerTurn - 1;
      const willBeLastPlayer = gameStats.currentPlayerIndex === rotationPlayers.length - 1;

      if (willBeLastBall && willBeLastPlayer) {
        // Calculate round winner
        const currentRoundScores = matchPlayers.map(p => ({
          name: p.display_name,
          score: gameStats.stats.get(p.id)!.roundScores[gameStats.currentRound - 1] + points
        }));
        const maxScore = Math.max(...currentRoundScores.map(s => s.score));
        const winners = currentRoundScores.filter(s => s.score === maxScore);
        
        setRoundWinnerName(winners.map(w => w.name).join(' & '));
        setShowRoundWinner(true);

        if (gameStats.currentRound === totalRounds) {
          const finalStats = Array.from(gameStats.stats.entries()).map(([id, s]) => {
            if (id === currentPlayer.id) {
              return { id, totalPoints: s.totalPoints + points, tens: s.tens + (points === 10 ? 1 : 0) };
            }
            return { id, totalPoints: s.totalPoints, tens: s.tens };
          });

          if (isTeamMode) {
            const teamFinalTotals = orderedTeams.map(team => {
              const memberIds = new Set(players.filter(p => p.team_id === team.id).map(p => p.profile_id));
              const agg = finalStats
                .filter(f => memberIds.has(f.id))
                .reduce((acc, f) => ({ totalPoints: acc.totalPoints + f.totalPoints, tens: acc.tens + f.tens }), { totalPoints: 0, tens: 0 });
              return { teamId: team.id, ...agg };
            });

            teamFinalTotals.sort((a, b) => {
              if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
              return b.tens - a.tens;
            });

            await completeMatchWithTeamWinner(match.id, teamFinalTotals[0].teamId);
          } else {
            finalStats.sort((a, b) => {
              if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
              return b.tens - a.tens;
            });

            await completeMatchWithWinner(match.id, finalStats[0].id);
          }
          ctx.onRefresh();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (loading || eventsLoading || isSpectator || !canInteract) return;
    setLoading(true);
    try {
      await undoLastEvent(match.id);
      await refreshEvents();
    } finally {
      setLoading(false);
    }
  };

  const handleRematch = async () => {
    if (isCreatingRematch) return;
    setIsCreatingRematch(true);
    try {
      const roomCode = generateRoomCode();
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

      if (orderedTeams.length > 0) {
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

        const sortedNewTeams = [...(newTeams || [])].sort((a: MatchTeam, b: MatchTeam) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        orderedTeams.forEach((oldTeam, index) => {
          const newTeam = sortedNewTeams[index];
          if (newTeam?.id) teamIdMap.set(oldTeam.id, newTeam.id);
        });

        const { error: playersError } = await supabase.from('match_players').insert(
          players.map(p => ({
            match_id: newMatch.id,
            profile_id: p.profile_id,
            role: p.role,
            team_id: p.team_id ? teamIdMap.get(p.team_id) || null : null,
            batting_order: p.batting_order,
            lineup_order: p.lineup_order,
          }))
        );

        if (playersError) throw playersError;
      } else {
        const matchPlayersToInsert = players.map(p => ({
          match_id: newMatch.id,
          profile_id: p.profile_id,
          role: p.role,
          batting_order: p.batting_order
        }));

        const { error: playersError } = await supabase
          .from('match_players')
          .insert(matchPlayersToInsert);

        if (playersError) throw playersError;
      }

      navigate(`/match/${roomCode}`);
    } catch (err) {
      console.error('Failed to create rematch:', err);
    } finally {
      setIsCreatingRematch(false);
    }
  };

  const sortedLeaderboard = [...matchPlayers].sort((a, b) => {
    const sA = gameStats.stats.get(a.id)!;
    const sB = gameStats.stats.get(b.id)!;
    if (sB.totalPoints !== sA.totalPoints) return sB.totalPoints - sA.totalPoints;
    return sB.tens - sA.tens; // Tie-breaker: most 10s
  });

  return (
    <div className="flex flex-col h-full bg-charcoal-950 overflow-hidden">
      {/* Game Header */}
      <div className="bg-charcoal-900 border-b border-charcoal-800 p-4 shadow-lg z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">
              {gameStats.isGameOver ? 'Match Complete' : `Round ${gameStats.currentRound} of ${totalRounds}`}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xl">⛳</span>
              <h1 className="text-lg font-black text-charcoal-50 uppercase tracking-tight">Chip Off</h1>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-1">Balls/Turn</span>
            <div className="flex gap-1 justify-end">
              {Array.from({ length: ballsPerTurn }).map((_, i) => (
                <div 
                  key={i} 
                  className={`w-2.5 h-2.5 rounded-full border ${
                    i < gameStats.currentBallIndex ? 'bg-emerald-500 border-emerald-400' : 'bg-charcoal-800 border-charcoal-700'
                  }`} 
                />
              ))}
            </div>
          </div>
        </div>

        {isTeamMode && teamTotals.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {teamTotals.map(({ team, total }) => (
              <div
                key={team.id}
                className={`rounded-xl border p-3 flex items-center gap-2 ${
                  !gameStats.isGameOver && currentTeamId === team.id
                    ? 'border-emerald-500/50 bg-emerald-950/20'
                    : 'border-charcoal-700 bg-charcoal-800/50'
                }`}
              >
                <Users size={14} style={{ color: team.team_color }} className="flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: team.team_color }}>{team.team_name}</p>
                  <p className="text-xl font-mono font-black text-charcoal-50 leading-none">{total}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!gameStats.isGameOver && currentPlayer && (
          <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-500 ${
            isMyTurn ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-charcoal-800/50 border-charcoal-700'
          }`}>
            <UserAvatar display_name={currentPlayer.display_name} avatar_color={currentPlayer.avatar_color} avatar_url={currentPlayer.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Active Player</p>
              <h3 className="text-xl font-black text-charcoal-50 truncate uppercase tracking-tight">
                {isMyTurn ? 'Your Turn!' : currentPlayer.display_name}
              </h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Ball</p>
              <p className="text-2xl font-mono font-black text-charcoal-50">{gameStats.currentBallIndex + 1}<span className="text-charcoal-600 text-sm">/{ballsPerTurn}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Scoring Pad or Match Summary */}
        {(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id || isSpectator || isTvDisplayMode) ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
            {(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id) && <Trophy size={48} className="text-emerald-500 mb-4" />}
            <h2 className="text-2xl font-black text-charcoal-50 mb-6">
              {(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id) ? 'Match Complete' : 'Live Leaderboard'}
            </h2>

            {isTeamMode && teamTotals.length > 0 && (
              <div className="w-full grid grid-cols-2 gap-3 mb-6">
                {[...teamTotals].sort((a, b) => b.total - a.total).map(({ team, total }, idx) => (
                  <div
                    key={team.id}
                    className={`rounded-xl p-4 border text-left ${idx === 0 ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-charcoal-700 bg-charcoal-800'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: team.team_color }}>{team.team_name}</p>
                    <p className="text-3xl font-mono font-black text-charcoal-50">{total}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="w-full space-y-4">
              {sortedLeaderboard.map((p, idx) => {
                const stat = gameStats.stats.get(p.id)!;
                return (
                  <div key={p.id} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">{idx + 1}</div>
                      <UserAvatar display_name={p.display_name} avatar_color={p.avatar_color} avatar_url={p.avatar_url} size="sm" />
                      <span className="font-bold text-charcoal-100 flex-1 truncate">{p.display_name}</span>
                      <span className="font-mono text-xl font-black text-charcoal-50">{stat.totalPoints} <span className="text-[10px] uppercase text-charcoal-500">pts</span></span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] font-bold text-charcoal-500 uppercase tracking-widest">Chips</p>
                        <p className="font-mono text-base font-black text-charcoal-200">{stat.chips}</p>
                      </div>
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-warning-500/20">
                        <p className="text-[8px] font-bold text-warning-500 uppercase tracking-tight">Hole In One</p>
                        <p className="font-mono text-base font-black text-warning-400">{stat.tens}</p>
                      </div>
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-emerald-500/20">
                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">5s</p>
                        <p className="font-mono text-base font-black text-emerald-400">{stat.fives}</p>
                      </div>
                      <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-blue-500/20">
                        <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">2s</p>
                        <p className="font-mono text-base font-black text-blue-400">{stat.twos}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  <ArrowLeft size={18} />
                  Dashboard
                </button>
              </div>
            )}
          </div>
        ) : !isSpectator && !isTvDisplayMode && (
          <div className="space-y-4 max-w-md mx-auto">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleScore(10)}
                disabled={loading || eventsLoading || !canInteract}
                className="col-span-2 group relative overflow-hidden py-8 rounded-3xl border-2 border-warning-500/50 bg-warning-500/10 active:scale-95 transition-all shadow-[0_0_30px_rgba(245,158,11,0.1)]"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-warning-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center">
                  <Star className="text-warning-400 mb-2 animate-pulse" size={32} fill="currentColor" />
                  <span className="text-4xl font-black text-warning-400 leading-none">10</span>
                  <span className="text-[10px] font-black text-warning-500 uppercase tracking-[0.2em] mt-2">Hole-In-One</span>
                </div>
              </button>

              <button
                onClick={() => handleScore(5)}
                disabled={loading || eventsLoading || !canInteract}
                className="py-6 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 active:scale-95 transition-all flex flex-col items-center"
              >
                <span className="text-3xl font-black text-emerald-400 leading-none">5</span>
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Inner Circle</span>
              </button>

              <button
                onClick={() => handleScore(2)}
                disabled={loading || eventsLoading || !canInteract}
                className="py-6 rounded-2xl border-2 border-blue-500/40 bg-blue-500/5 active:scale-95 transition-all flex flex-col items-center"
              >
                <span className="text-3xl font-black text-blue-400 leading-none">2</span>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1">Outer Circle</span>
              </button>

              <button
                onClick={() => handleScore(0)}
                disabled={loading || eventsLoading || !canInteract}
                className={`py-5 rounded-2xl border-2 active:scale-95 transition-all flex items-center justify-center gap-3 ${
                  hazardPenalty ? '' : 'col-span-2'
                } border-charcoal-700 bg-charcoal-800 text-charcoal-400`}
              >
                <span className="text-2xl font-black font-mono leading-none">0</span>
                <span className="text-[10px] font-black uppercase tracking-widest">Miss</span>
              </button>

              {hazardPenalty && (
                <button
                  onClick={() => handleScore(-1)}
                  disabled={loading || eventsLoading || !canInteract}
                  className="py-5 rounded-2xl border-2 border-danger-500/40 bg-danger-500/5 text-danger-400 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <span className="text-2xl font-black font-mono leading-none">-1</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Hazard</span>
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUndo}
                disabled={loading || eventsLoading || !canInteract || events.length === 0}
                className="flex-1 py-3 rounded-xl bg-charcoal-800 border border-charcoal-700 text-charcoal-400 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Undo Last Shot
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard (Only for active players, hidden in spectator/TV mode) */}
        {(!gameStats.isGameOver && !match.winner_profile_id && !match.winner_team_id && !isSpectator && !isTvDisplayMode) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black text-charcoal-500 uppercase tracking-[0.2em]">Leaderboard</h3>
              <div className="flex gap-6">
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-8 text-center">H-I-O</span>
                <span className="text-[9px] font-bold text-charcoal-600 uppercase w-12 text-right">Points</span>
              </div>
            </div>

          <div className="space-y-2">
            {sortedLeaderboard.map((p, idx) => {
              const stat = gameStats.stats.get(p.id)!;
              const isFirst = idx === 0;
              return (
                <div 
                  key={p.id} 
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                    isFirst ? 'bg-emerald-950/10 border-emerald-500/30' : 'bg-charcoal-900/40 border-charcoal-800'
                  }`}
                >
                  <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">
                    {idx + 1}
                  </div>
                  <UserAvatar display_name={p.display_name} avatar_color={p.avatar_color} avatar_url={p.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-charcoal-50 truncate uppercase tracking-tight">{p.display_name}</p>
                    {isFirst && <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none mt-0.5">Leader</p>}
                  </div>
                  <div className="flex items-center gap-6 font-mono">
                    <div className="w-8 text-center">
                      <span className={`text-sm font-bold ${stat.tens > 0 ? 'text-warning-400' : 'text-charcoal-600'}`}>
                        {stat.tens}
                      </span>
                    </div>
                    <div className="w-12 text-right">
                      <span className="text-xl font-black text-charcoal-50">{stat.totalPoints}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Round Winner Modal */}
      <Modal isOpen={showRoundWinner} onClose={() => setShowRoundWinner(false)} title="Round Complete!">
        <div className="space-y-6 text-center py-4">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500/30">
            <Trophy className="text-emerald-500" size={40} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-charcoal-50 uppercase tracking-tight mb-2">
              {roundWinnerName} Wins the Round!
            </h3>
            <p className="text-charcoal-400 text-sm leading-relaxed px-4">
              The winner gets the backyard advantage! Move the <span className="text-emerald-400 font-bold">Tee Box</span> and <span className="text-emerald-400 font-bold">Pin</span> anywhere in the yard for the next round.
            </p>
          </div>
          <button 
            onClick={() => setShowRoundWinner(false)}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-charcoal-50 font-black rounded-2xl shadow-lg transition-all active:scale-95 uppercase tracking-widest text-sm"
          >
            {gameStats.isGameOver ? 'See Final Leaderboard' : 'Start Next Round'}
          </button>
        </div>
      </Modal>

      {/* Spectator Warning */}
      {isSpectator && (
        <div className="p-4 bg-charcoal-900 border-t border-charcoal-800">
          <div className="flex items-center gap-3 text-charcoal-400">
            <AlertCircle size={18} />
            <p className="text-xs font-bold uppercase tracking-wider">Viewing as Spectator</p>
          </div>
        </div>
      )}
    </div>
  );
}
