import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent, undoLastEvent, completeMatchWithWinner } from '../../lib/matches';
import Avatar from '../Avatar';
import Modal from '../Modal';
import { useNavigate } from 'react-router-dom';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile, GolfHole, MatchEvent } from '../../lib/supabase';
import { Trophy, Star, ChevronRight, RotateCcw, AlertCircle, ArrowLeft } from 'lucide-react';

interface ChipOffRules {
  balls_per_turn?: number;
  total_rounds?: number;
  hazard_penalty?: boolean;
}

export default function ChipOffRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;
  const rules = (match.house_rules || {}) as ChipOffRules;
  const ballsPerTurn = rules.balls_per_turn || 3;
  const totalRounds = rules.total_rounds || 9;
  const hazardPenalty = rules.hazard_penalty || false;

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showRoundWinner, setShowRoundWinner] = useState(false);
  const [roundWinnerName, setRoundWinnerName] = useState('');
  const navigate = useNavigate();
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const matchPlayers = useMemo(() => 
    players
      .map(p => profiles.get(p.profile_id))
      .filter(Boolean) as Profile[]
  , [players, profiles]);

  const loadData = useCallback(async () => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', match.id)
        .eq('is_undone', false)
        .order('sequence_num', { ascending: true })
        .abortSignal(abortControllerRef.current.signal);
      
      if (!isMountedRef.current) return;
      
      if (error) {
        if (!error.message?.includes('AbortError')) {
          console.error("Error loading chip-off events:", error);
        }
        return;
      }
      
      if (data) {
        setEvents(data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
      console.error("Error loading chip-off events:", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [match.id]);

  useEffect(() => { 
    loadData(); 
  }, [loadData]);

  // Subscribe to events
  useEffect(() => {
    const handleRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        loadData();
      }, 200); // 200ms debounce
    };

    const channel = supabase
      .channel(`chipoff:${match.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_events', 
        filter: `match_id=eq.${match.id}` 
      }, () => handleRefresh())
      .subscribe();
    return () => { 
      supabase.removeChannel(channel);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [match.id, loadData]);

  // Game Logic Derived State
  const gameStats = useMemo(() => {
    const stats = new Map<string, { totalPoints: number; tens: number; fives: number; twos: number; misses: number; hazards: number; chips: number; roundScores: number[] }>();
    matchPlayers.forEach(p => stats.set(p.id, { totalPoints: 0, tens: 0, fives: 0, twos: 0, misses: 0, hazards: 0, chips: 0, roundScores: Array(totalRounds).fill(0) }));

    let currentRound = 1;
    let currentPlayerIndex = 0;
    let currentBallIndex = 0;

    events.forEach(event => {
      if (event.event_type === 'chip_off_score') {
        const pId = event.player_id!;
        const points = (event.event_data.points as number) || 0;
        const playerStat = stats.get(pId);
        if (playerStat) {
          playerStat.totalPoints += points;
          playerStat.chips += 1;
          if (points === 10) playerStat.tens += 1;
          else if (points === 5) playerStat.fives += 1;
          else if (points === 2) playerStat.twos += 1;
          else if (points === 0) playerStat.misses += 1;
          else if (points === -1) playerStat.hazards += 1;

          playerStat.roundScores[currentRound - 1] += points;
        }

        currentBallIndex++;
        if (currentBallIndex >= ballsPerTurn) {
          currentBallIndex = 0;
          currentPlayerIndex++;
          if (currentPlayerIndex >= matchPlayers.length) {
            currentPlayerIndex = 0;
            currentRound++;
          }
        }
      }
    });

    return {
      stats,
      currentRound: Math.min(currentRound, totalRounds),
      currentPlayerIndex,
      currentBallIndex,
      isGameOver: currentRound > totalRounds
    };
  }, [events, matchPlayers, ballsPerTurn, totalRounds]);

  const currentPlayer = matchPlayers[gameStats.currentPlayerIndex];
  const isMyTurn = !isSpectator && currentUser?.id === currentPlayer?.id;

  const handleScore = async (points: number) => {
    if (!currentPlayer || loading || isSpectator) return;
    setLoading(true);
    try {
      await recordEvent(
        match.id,
        'chip_off_score',
        { points, round: gameStats.currentRound, ball: gameStats.currentBallIndex + 1 },
        currentPlayer.id,
        undefined,
        currentUser?.id
      );

      // Check if this was the last ball of the round
      const willBeLastBall = gameStats.currentBallIndex === ballsPerTurn - 1;
      const willBeLastPlayer = gameStats.currentPlayerIndex === matchPlayers.length - 1;

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
          
          finalStats.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            return b.tens - a.tens;
          });
          
          await completeMatchWithWinner(match.id, finalStats[0].id);
          ctx.onRefresh();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (loading || isSpectator) return;
    setLoading(true);
    try {
      await undoLastEvent(match.id);
      await loadData();
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

        {!gameStats.isGameOver && currentPlayer && (
          <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-500 ${
            isMyTurn ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-charcoal-800/50 border-charcoal-700'
          }`}>
            <Avatar name={currentPlayer.display_name} color={currentPlayer.avatar_color} size="md" />
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
        {(gameStats.isGameOver || match.winner_profile_id || isSpectator || isTvDisplayMode) ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
            {(gameStats.isGameOver || match.winner_profile_id) && <Trophy size={48} className="text-emerald-500 mb-4" />}
            <h2 className="text-2xl font-black text-charcoal-50 mb-6">
              {(gameStats.isGameOver || match.winner_profile_id) ? 'Match Complete' : 'Live Leaderboard'}
            </h2>
            
            <div className="w-full space-y-4">
              {sortedLeaderboard.map((p, idx) => {
                const stat = gameStats.stats.get(p.id)!;
                return (
                  <div key={p.id} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">{idx + 1}</div>
                      <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
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
                disabled={loading}
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
                disabled={loading}
                className="py-6 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 active:scale-95 transition-all flex flex-col items-center"
              >
                <span className="text-3xl font-black text-emerald-400 leading-none">5</span>
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Inner Circle</span>
              </button>

              <button
                onClick={() => handleScore(2)}
                disabled={loading}
                className="py-6 rounded-2xl border-2 border-blue-500/40 bg-blue-500/5 active:scale-95 transition-all flex flex-col items-center"
              >
                <span className="text-3xl font-black text-blue-400 leading-none">2</span>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1">Outer Circle</span>
              </button>

              <button
                onClick={() => handleScore(0)}
                disabled={loading}
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
                  disabled={loading}
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
                disabled={loading || events.length === 0}
                className="flex-1 py-3 rounded-xl bg-charcoal-800 border border-charcoal-700 text-charcoal-400 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Undo Last Shot
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard (Only for active players, hidden in spectator/TV mode) */}
        {(!gameStats.isGameOver && !match.winner_profile_id && !isSpectator && !isTvDisplayMode) && (
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
                  <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
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
