import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, RotateCcw, Target, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DartsBoard from './DartsBoard';
import Avatar from '../Avatar';
import { completeMatchWithWinner, recordEvent, undoLastEvent } from '../../lib/matches';
import { supabase } from '../../lib/supabase';
import { createThrow, getSegmentKey } from '../../lib/darts/board';
import { applyAroundTheWorldThrow, createAroundTheWorldState, getAroundTheWorldTarget } from '../../lib/darts/aroundTheWorldEngine';
import { applyCountdownThrow, createCountdownState } from '../../lib/darts/countdownEngine';
import { applyKillerThrow, createKillerState, overrideKillerTargets } from '../../lib/darts/killerEngine';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type {
  AroundTheWorldRules,
  CountdownRules,
  DartsHighlightState,
  DartsPendingMenu,
  DartsRuntimeState,
  DartsThrow,
  DartsVariant,
  KillerRules,
} from '../../lib/darts/types';
import type { Profile } from '../../lib/supabase';

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getVariant(matchVariant: unknown): DartsVariant {
  if (matchVariant === 'around_the_world' || matchVariant === 'killer') return matchVariant;
  return 'countdown';
}

function buildInitialState(
  variant: DartsVariant,
  playerIds: string[],
  countdownRules: CountdownRules,
  killerRules: KillerRules,
  winnerProfileId: string | null
) {
  let initialState: DartsRuntimeState;

  if (variant === 'around_the_world') {
    initialState = createAroundTheWorldState(playerIds);
  } else if (variant === 'killer') {
    initialState = createKillerState(playerIds, killerRules);
  } else {
    initialState = createCountdownState(playerIds, countdownRules);
  }

  return {
    ...initialState,
    winner: winnerProfileId,
  };
}

export default function DartsRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode, onRefresh } = ctx;

  const variant = getVariant((match.house_rules as Record<string, unknown>)?.variant);
  const countdownRules: CountdownRules = {
    startScore: (match.house_rules as Record<string, unknown>)?.start_score as number ?? 501,
    doubleOut: (match.house_rules as Record<string, unknown>)?.double_out as boolean ?? true,
  };
  const aroundRules: AroundTheWorldRules = {
    skipAheadViaMultiples: (match.house_rules as Record<string, unknown>)?.skip_ahead_via_multiples as boolean ?? false,
    ringRestriction: ((match.house_rules as Record<string, unknown>)?.ring_restriction as AroundTheWorldRules['ringRestriction']) ?? 'any_segment',
  };
  const killerRules: KillerRules = {
    startingLives: (match.house_rules as Record<string, unknown>)?.starting_lives as number ?? 3,
    activationRing: ((match.house_rules as Record<string, unknown>)?.killer_activation_ring as KillerRules['activationRing']) ?? 'doubles_only',
  };

  const matchPlayers = useMemo(
    () => players.map(player => profiles.get(player.profile_id)).filter(Boolean) as Profile[],
    [players, profiles]
  );
  const playerIds = useMemo(() => matchPlayers.map(player => player.id), [matchPlayers]);

  const [state, setState] = useState<DartsRuntimeState>(() =>
    buildInitialState(variant, playerIds, countdownRules, killerRules, match.winner_profile_id)
  );
  const [pendingMenu, setPendingMenu] = useState<DartsPendingMenu | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoStack, setUndoStack] = useState<DartsRuntimeState[]>([]);
  const [recentSegmentKey, setRecentSegmentKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setState(buildInitialState(variant, playerIds, countdownRules, killerRules, match.winner_profile_id));
    setPendingMenu(null);
    setUndoStack([]);
    setRecentSegmentKey(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    variant,
    match.id,
    countdownRules.startScore,
    countdownRules.doubleOut,
    aroundRules.skipAheadViaMultiples,
    aroundRules.ringRestriction,
    killerRules.startingLives,
    killerRules.activationRing,
    playerIds.join('|'),
  ]);

  useEffect(() => {
    if (match.winner_profile_id && state.winner !== match.winner_profile_id) {
      setState(prev => ({ ...prev, winner: match.winner_profile_id }));
    }
  }, [match.winner_profile_id, state.winner]);

  useEffect(() => {
    if (!recentSegmentKey) return undefined;
    const timer = window.setTimeout(() => setRecentSegmentKey(null), 220);
    return () => window.clearTimeout(timer);
  }, [recentSegmentKey]);

  const currentPlayer = matchPlayers[state.currentPlayerIdx];

  const canInteract = !isSpectator && !isTvDisplayMode && !loading && (match.status === 'active' || isAdmin) && !state.winner;
  const canUndo = canInteract && undoStack.length > 0;

  const persistThrow = async (throwData: DartsThrow) => {
    if (!currentPlayer || loading || state.winner) return;

    const previousState = cloneState(state);
    let result;

    if (variant === 'around_the_world') {
      result = applyAroundTheWorldThrow(state, currentPlayer.id, throwData, aroundRules);
    } else if (variant === 'killer') {
      result = applyKillerThrow(state, currentPlayer.id, playerIds, throwData, killerRules);
    } else {
      result = applyCountdownThrow(state, currentPlayer.id, throwData, countdownRules);
    }

    setLoading(true);
    setError('');
    setPendingMenu(null);
    setRecentSegmentKey(getSegmentKey(throwData.segment));
    setUndoStack(prev => [...prev, previousState]);
    setState(result.state);

    try {
      await recordEvent(match.id, result.event.type, result.event.data, currentPlayer.id, undefined, currentUser?.id);
      if (result.winnerProfileId) {
        await completeMatchWithWinner(match.id, result.winnerProfileId);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to record darts throw:', err);
      setState(previousState);
      setUndoStack(prev => prev.slice(0, -1));
      setError('Failed to save throw. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!canUndo) return;

    const previousState = undoStack[undoStack.length - 1];
    setLoading(true);
    setError('');

    try {
      await undoLastEvent(match.id);
      setState(previousState);
      setUndoStack(prev => prev.slice(0, -1));
      setPendingMenu(null);
      setRecentSegmentKey(null);
    } catch (err) {
      console.error('Failed to undo darts throw:', err);
      setError('Undo failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTargetOverride = (playerId: string, nextTargetNumber: number) => {
    if (variant !== 'killer' || state.killer?.assignmentsLocked || !isAdmin) return;

    const currentAssignments = Object.fromEntries(
      Object.entries(state.killer.players).map(([candidateId, candidateState]) => [candidateId, candidateState.targetNumber])
    ) as Record<string, number>;

    const swapPlayerId = Object.entries(currentAssignments).find(([candidateId, value]) => (
      candidateId !== playerId && value === nextTargetNumber
    ))?.[0];

    const updatedAssignments = { ...currentAssignments };
    if (swapPlayerId) {
      updatedAssignments[swapPlayerId] = updatedAssignments[playerId];
    }
    updatedAssignments[playerId] = nextTargetNumber;

    setState(prev => overrideKillerTargets(prev, updatedAssignments));
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
      setError('Failed to create rematch. Please try again.');
    } finally {
      setIsCreatingRematch(false);
    }
  };

  const highlightState = useMemo<DartsHighlightState>(() => {
    const highlight: DartsHighlightState = {};
    if (recentSegmentKey) {
      highlight[recentSegmentKey] = [...(highlight[recentSegmentKey] || []), 'recent'];
    }

    if (!currentPlayer) return highlight;

    if (variant === 'around_the_world') {
      const progress = state.aroundTheWorld?.progress[currentPlayer.id] ?? 1;
      const target = getAroundTheWorldTarget(progress);

      for (let number = 1; number <= 20; number += 1) {
        const key = getSegmentKey(number);
        if (target === number) {
          highlight[key] = [...(highlight[key] || []), 'active', 'valid'];
        } else {
          highlight[key] = [...(highlight[key] || []), 'dimmed'];
        }
      }

      if (target === 'bull') {
        highlight.bull = [...(highlight.bull || []), 'active', 'valid'];
        highlight.double_bull = [...(highlight.double_bull || []), 'active', 'valid'];
      }
    }

    if (variant === 'killer' && state.killer) {
      const currentState = state.killer.players[currentPlayer.id];
      Object.entries(state.killer.players).forEach(([playerId, playerState]) => {
        const key = getSegmentKey(playerState.targetNumber);
        if (playerState.isEliminated) {
          highlight[key] = [...(highlight[key] || []), 'eliminated'];
          return;
        }

        if (!currentState?.isKiller) {
          if (playerId === currentPlayer.id) {
            highlight[key] = [...(highlight[key] || []), 'self', 'active', 'valid'];
          } else {
            highlight[key] = [...(highlight[key] || []), 'dimmed'];
          }
          return;
        }

        if (playerId === currentPlayer.id) {
          highlight[key] = [...(highlight[key] || []), 'self'];
        } else {
          highlight[key] = [...(highlight[key] || []), 'opponent', 'valid'];
        }
      });
    }

    return highlight;
  }, [currentPlayer, recentSegmentKey, state.aroundTheWorld, state.killer, variant]);

  const matchStats = useMemo(() => {
    if (!state.winner) return [];
    
    return matchPlayers.map(p => {
      const pTurns = state.turns.filter(t => t.profileId === p.id);
      const dartsThrown = pTurns.reduce((acc, t) => acc + t.darts.length, 0);
      
      let threeDartAvg = 0;
      let first9Avg = 0;
      
      if (variant === 'countdown') {
        const totalPoints = pTurns.reduce((acc, t) => acc + (t.bust ? 0 : t.total), 0);
        threeDartAvg = dartsThrown > 0 ? (totalPoints / dartsThrown) * 3 : 0;
        
        let first9Darts = 0;
        let first9Points = 0;
        for (const t of pTurns) {
          for (const d of t.darts) {
            if (first9Darts < 9) {
              first9Darts++;
              first9Points += d.scoredPoints;
            }
          }
        }
        first9Avg = first9Darts > 0 ? (first9Points / first9Darts) * 3 : 0;
      }
      
      return {
        player: p,
        dartsThrown,
        threeDartAvg,
        first9Avg,
        livesRemaining: variant === 'killer' ? state.killer?.players[p.id]?.lives ?? 0 : 0
      };
    }).sort((a, b) => {
      if (a.player.id === state.winner) return -1;
      if (b.player.id === state.winner) return 1;
      if (variant === 'countdown') return b.threeDartAvg - a.threeDartAvg;
      return 0;
    });
  }, [state.winner, state.turns, matchPlayers, variant, state.killer]);

  const renderStatsGrid = () => (
    <div className="w-full space-y-4">
      {matchStats.map((stat, idx) => (
        <div key={stat.player.id} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">{idx + 1}</div>
            <Avatar name={stat.player.display_name} color={stat.player.avatar_color} size="sm" />
            <span className="font-bold text-charcoal-100 flex-1 truncate">{stat.player.display_name}</span>
            {stat.player.id === state.winner && (
              <span className="rounded-full bg-success-900/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-success-400 border border-success-500/20">
                Winner
              </span>
            )}
          </div>
          
          {variant === 'countdown' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold text-charcoal-500 uppercase tracking-widest">Darts</p>
                <p className="font-mono text-base font-black text-charcoal-200">{stat.dartsThrown}</p>
              </div>
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-accent-500/20">
                <p className="text-[9px] font-bold text-accent-500 uppercase tracking-widest">3-Dart Avg</p>
                <p className="font-mono text-base font-black text-accent-400">{stat.threeDartAvg.toFixed(1)}</p>
              </div>
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-warning-500/20">
                <p className="text-[9px] font-bold text-warning-500 uppercase tracking-widest">First 9 Avg</p>
                <p className="font-mono text-base font-black text-warning-400">{stat.first9Avg.toFixed(1)}</p>
              </div>
            </div>
          )}
          
          {variant === 'around_the_world' && (
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold text-charcoal-500 uppercase tracking-widest">Darts Thrown</p>
                <p className="font-mono text-base font-black text-charcoal-200">{stat.dartsThrown}</p>
              </div>
            </div>
          )}
          
          {variant === 'killer' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                <p className="text-[9px] font-bold text-charcoal-500 uppercase tracking-widest">Darts Thrown</p>
                <p className="font-mono text-base font-black text-charcoal-200">{stat.dartsThrown}</p>
              </div>
              <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-danger-500/20">
                <p className="text-[9px] font-bold text-danger-500 uppercase tracking-widest">Lives</p>
                <p className="font-mono text-base font-black text-danger-400">{stat.livesRemaining}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (matchPlayers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <div>
          <p className="text-charcoal-200 font-semibold">No Darts players yet</p>
          <p className="text-charcoal-500 text-sm mt-1">Add players to start the match.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-charcoal-700 bg-charcoal-800 px-4 py-3">
        <div className="grid gap-3 md:grid-cols-2">
          {matchPlayers.map((player, index) => {
            const isCurrent = state.currentPlayerIdx === index && !state.winner;
            const countdownScore = state.countdown?.scores[player.id];
            const atwTarget = state.aroundTheWorld ? getAroundTheWorldTarget(state.aroundTheWorld.progress[player.id] ?? 1) : null;
            const killerPlayer = state.killer?.players[player.id];

            return (
              <div
                key={player.id}
                className={`rounded-2xl border px-4 py-3 transition-all ${
                  isCurrent ? 'border-accent-500 bg-accent-700/20 shadow-[0_0_24px_rgba(34,211,238,0.14)]' : 'border-charcoal-700 bg-charcoal-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={player.display_name} color={player.avatar_color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-charcoal-50">{player.display_name}</p>
                      {isCurrent && <span className="text-[10px] font-black uppercase tracking-widest text-accent-300">Throwing</span>}
                    </div>

                    {variant === 'countdown' && (
                      <p className="font-mono text-3xl font-black text-charcoal-50">{countdownScore ?? countdownRules.startScore}</p>
                    )}

                    {variant === 'around_the_world' && (
                      <p className="text-sm font-semibold text-warning-300">
                        Target: <span className="font-mono text-charcoal-50">{atwTarget === 'bull' ? 'Bull' : atwTarget}</span>
                      </p>
                    )}

                    {variant === 'killer' && killerPlayer && (
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Target size={14} className="text-warning-400" />
                          <span className="text-charcoal-300">Target</span>
                          <span className="font-mono font-black text-charcoal-50">{killerPlayer.targetNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="flex items-center gap-1 text-danger-400">
                            {Array.from({ length: killerPlayer.lives }).map((_, heartIndex) => (
                              <Heart key={heartIndex} size={13} fill="currentColor" />
                            ))}
                            {killerPlayer.lives === 0 && <span className="font-mono text-charcoal-500">0</span>}
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                            killerPlayer.isEliminated
                              ? 'bg-charcoal-700 text-charcoal-400'
                              : killerPlayer.isKiller
                                ? 'bg-danger-900/50 text-danger-300'
                                : 'bg-warning-950/40 text-warning-300'
                          }`}>
                            {killerPlayer.isEliminated ? 'Eliminated' : killerPlayer.isKiller ? 'Killer' : 'Hunting Status'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {state.winner && (
          <div className="mt-3 rounded-2xl border border-success-500/40 bg-success-900/20 px-4 py-3 text-center">
            <p className="text-lg font-black text-success-300">🎯 {profiles.get(state.winner)?.display_name} wins</p>
            {state.winnerLabel && <p className="text-xs font-bold uppercase tracking-widest text-success-200/80 mt-1">{state.winnerLabel}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {variant === 'killer' && state.killer && !state.killer.assignmentsLocked && isAdmin && !isSpectator && (
            <div className="card p-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-charcoal-400">Killer Target Override</h3>
              <p className="mt-1 text-sm text-charcoal-500">Targets can be adjusted before the first throw only.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {matchPlayers.map(player => (
                  <label key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-charcoal-700 bg-charcoal-900/40 px-3 py-3">
                    <span className="text-sm font-semibold text-charcoal-200">{player.display_name}</span>
                    <select
                      value={state.killer?.players[player.id]?.targetNumber ?? 1}
                      onChange={event => handleTargetOverride(player.id, Number(event.target.value))}
                      className="rounded-lg border border-charcoal-600 bg-charcoal-800 px-3 py-2 text-sm font-mono text-charcoal-100 outline-none"
                    >
                      {Array.from({ length: 20 }, (_, index) => index + 1).map(number => (
                        <option key={number} value={number}>{number}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-charcoal-500">Current Turn</p>
                  <p className="text-sm font-semibold text-charcoal-200">
                    {currentPlayer ? currentPlayer.display_name : 'Waiting'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {state.currentDarts.map((dart, index) => (
                    <span key={`${dart.label}-${index}`} className="rounded-lg bg-accent-700/40 px-3 py-1.5 font-mono text-sm font-bold text-accent-100">
                      {dart.label}
                    </span>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - state.currentDarts.length) }).map((_, index) => (
                    <span key={index} className="rounded-lg border border-dashed border-charcoal-600 px-3 py-1.5 font-mono text-sm text-charcoal-600">
                      -
                    </span>
                  ))}
                </div>
              </div>

              {state.winner ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
                  <Target size={48} className="text-emerald-500 mb-4" />
                  <h2 className="text-2xl font-black text-charcoal-50 mb-6">Match Complete</h2>
                  
                  {renderStatsGrid()}
                  
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
              ) : (
                <>
                  <DartsBoard
                    mode={variant}
                    disabled={!canInteract}
                    pendingMenu={pendingMenu}
                    highlightState={highlightState}
                    onSegmentTap={(segment, anchor) => setPendingMenu({ segment, x: anchor.x, y: anchor.y })}
                    onBullTap={() => persistThrow(createThrow('bull', 'bull'))}
                    onDoubleBullTap={() => persistThrow(createThrow('double_bull', 'double_bull'))}
                    onMultiplierSelect={multiplier => {
                      if (!pendingMenu) return;
                      const ring = multiplier === 1 ? 'single' : multiplier === 2 ? 'double' : 'triple';
                      persistThrow(createThrow(pendingMenu.segment, ring));
                    }}
                    onDismissMultiplier={() => setPendingMenu(null)}
                  />

                  {!isSpectator && !isTvDisplayMode && (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => persistThrow(createThrow('bull', 'bull'))}
                        disabled={!canInteract}
                        className="rounded-xl border border-warning-700 bg-warning-950/30 px-4 py-3 text-sm font-black uppercase tracking-wider text-warning-300 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Bull
                      </button>
                      <button
                        type="button"
                        onClick={() => persistThrow(createThrow('double_bull', 'double_bull'))}
                        disabled={!canInteract}
                        className="rounded-xl border border-success-700 bg-success-950/30 px-4 py-3 text-sm font-black uppercase tracking-wider text-success-300 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        D-Bull
                      </button>
                      <button
                        type="button"
                        onClick={() => persistThrow(createThrow('miss', 'miss'))}
                        disabled={!canInteract}
                        className="rounded-xl border border-charcoal-600 bg-charcoal-800 px-4 py-3 text-sm font-black uppercase tracking-wider text-charcoal-200 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Miss
                      </button>
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="rounded-xl border border-accent-700 bg-accent-950/30 px-4 py-3 text-sm font-black uppercase tracking-wider text-accent-300 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="inline-flex items-center gap-2">
                          <RotateCcw size={15} />
                          Undo
                        </span>
                      </button>
                    </div>
                  )}

                  {(isSpectator || isTvDisplayMode) && (
                    <div className="mt-8 border-t border-charcoal-700 pt-6">
                      <h2 className="text-xl font-black text-charcoal-50 mb-4 text-center uppercase tracking-wide">Live Leaderboard</h2>
                      {renderStatsGrid()}
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-danger-500/40 bg-danger-900/20 px-3 py-3 text-sm text-danger-200">
                  {error}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {variant === 'around_the_world' && (
                <div className="card p-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-charcoal-400">Around The World</h3>
                  <div className="mt-3 space-y-2">
                    {matchPlayers.map(player => {
                      const target = getAroundTheWorldTarget(state.aroundTheWorld?.progress[player.id] ?? 1);
                      return (
                        <div key={player.id} className="flex items-center justify-between rounded-xl border border-charcoal-700 bg-charcoal-900/50 px-3 py-3">
                          <span className="text-sm font-semibold text-charcoal-200">{player.display_name}</span>
                          <span className="font-mono text-sm font-black text-warning-300">
                            {target === 'bull' ? 'Bull' : `Target ${target}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {variant === 'killer' && state.killer && (
                <div className="card p-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-charcoal-400">Killer Status</h3>
                  <div className="mt-3 space-y-3">
                    {matchPlayers.map(player => {
                      const killerPlayer = state.killer?.players[player.id];
                      if (!killerPlayer) return null;
                      return (
                        <div key={player.id} className="rounded-xl border border-charcoal-700 bg-charcoal-900/50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-charcoal-100">{player.display_name}</span>
                            <span className="font-mono text-sm font-black text-warning-300">#{killerPlayer.targetNumber}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 text-danger-400">
                              {Array.from({ length: killerPlayer.lives }).map((_, heartIndex) => (
                                <Heart key={heartIndex} size={14} fill="currentColor" />
                              ))}
                              {killerPlayer.lives === 0 && <XCircle size={15} className="text-charcoal-500" />}
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                              killerPlayer.isEliminated
                                ? 'bg-charcoal-700 text-charcoal-400'
                                : killerPlayer.isKiller
                                  ? 'bg-danger-900/60 text-danger-200'
                                  : 'bg-warning-950/50 text-warning-200'
                            }`}>
                              {killerPlayer.isEliminated ? 'Eliminated' : killerPlayer.isKiller ? 'Killer Active' : 'Seeking Activation'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card p-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-charcoal-400">Turn History</h3>
                <div className="mt-3 space-y-2">
                  {state.turns.length === 0 ? (
                    <p className="text-sm text-charcoal-500">No darts thrown yet.</p>
                  ) : (
                    state.turns.slice(-8).reverse().map((turn, index) => (
                      <div key={`${turn.profileId}-${index}`} className={`rounded-xl border px-3 py-3 ${
                        turn.bust ? 'border-danger-600/40 bg-danger-900/15' : 'border-charcoal-700 bg-charcoal-900/50'
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-charcoal-200">{profiles.get(turn.profileId)?.display_name}</span>
                          <span className="font-mono text-sm font-black text-charcoal-100">{turn.total}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {turn.darts.map((dart, dartIndex) => (
                            <span key={`${dart.label}-${dartIndex}`} className="rounded-lg bg-charcoal-800 px-2 py-1 font-mono text-xs font-bold text-charcoal-300">
                              {dart.label}
                            </span>
                          ))}
                        </div>
                        {turn.label && <p className="mt-2 text-xs font-bold uppercase tracking-widest text-charcoal-500">{turn.label}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
