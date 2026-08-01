import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Circle, Flame, RotateCcw, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { completeMatchWithTeamWinner, completeMatchWithWinner, generateRoomCode, recordEvent, undoLastEvent } from '../../lib/matches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import UserAvatar from '../UserAvatar';
import {
  POOL_BALL_NUMBERS,
  applyPoolPot,
  ballGroupOf,
  getCurrentShooterId,
  getSideClearance,
  replayPoolEvents,
  type PoolSideConfig,
  type PoolSideIndex,
  type PoolVariant,
} from '../../lib/pool/poolEngine';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { MatchTeam } from '../../lib/supabase';

// Standard billiard colors - 9-15 render as the same hue as 1-7 with a
// white stripe band, matching the real ball set.
const BALL_COLORS: Record<number, string> = {
  1: '#eab308', 2: '#2563eb', 3: '#dc2626', 4: '#7c3aed', 5: '#ea580c', 6: '#16a34a', 7: '#7f1d1d',
};
const SIDE_FALLBACK_COLORS: [string, string] = ['#3b82f6', '#ef4444'];

function ballStyle(ball: number): React.CSSProperties {
  if (ball === 8) return { backgroundColor: '#111827' };
  const color = BALL_COLORS[ball === 16 ? 1 : ball > 8 ? ball - 8 : ball];
  if (ball <= 7) return { backgroundColor: color };
  return {
    background: `linear-gradient(to bottom, white 0%, white 28%, ${color} 28%, ${color} 72%, white 72%, white 100%)`,
  };
}

export default function PoolRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode, onRefresh } = ctx;
  const variant: PoolVariant = (match.house_rules as Record<string, unknown>)?.variant === '8_ball' ? '8_ball' : '16_ball';
  const isTeamMode = teams.length >= 2;

  const [loading, setLoading] = useState(false);
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const navigate = useNavigate();

  const orderedTeams = useMemo(() => [...teams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [teams]);

  const teamLineups = useMemo(() => {
    const map = new Map<string, string[]>();
    orderedTeams.forEach(team => {
      const lineup = players
        .filter(p => p.team_id === team.id)
        .sort((a, b) => (a.lineup_order ?? a.batting_order ?? 999) - (b.lineup_order ?? b.batting_order ?? 999))
        .map(p => p.profile_id);
      map.set(team.id, lineup);
    });
    return map;
  }, [players, orderedTeams]);

  const individualPlayers = useMemo(() =>
    [...players]
      .filter(p => !p.team_id)
      .sort((a, b) => (a.lineup_order ?? a.batting_order ?? 999) - (b.lineup_order ?? b.batting_order ?? 999))
      .map(p => p.profile_id)
  , [players]);

  const sides: [PoolSideConfig, PoolSideConfig] | null = useMemo(() => {
    if (isTeamMode) {
      if (orderedTeams.length < 2) return null;
      return [
        { id: orderedTeams[0].id, lineup: teamLineups.get(orderedTeams[0].id) || [] },
        { id: orderedTeams[1].id, lineup: teamLineups.get(orderedTeams[1].id) || [] },
      ];
    }
    if (individualPlayers.length < 2) return null;
    return [
      { id: individualPlayers[0], lineup: [individualPlayers[0]] },
      { id: individualPlayers[1], lineup: [individualPlayers[1]] },
    ];
  }, [isTeamMode, orderedTeams, teamLineups, individualPlayers]);

  const { events, loading: eventsLoading, refresh: refreshEvents } = useMatchEvents(match.id);

  const state = useMemo(() => (sides ? replayPoolEvents(events, variant, sides) : null), [events, variant, sides]);

  if (!sides || !state) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-charcoal-400">
        Pool requires exactly two players or two teams to start.
      </div>
    );
  }

  const sideName = (idx: PoolSideIndex): string =>
    isTeamMode ? (orderedTeams[idx]?.team_name || `Team ${idx + 1}`) : (profiles.get(sides[idx].id)?.display_name || `Player ${idx + 1}`);
  const sideColor = (idx: PoolSideIndex): string =>
    isTeamMode ? (orderedTeams[idx]?.team_color || SIDE_FALLBACK_COLORS[idx]) : SIDE_FALLBACK_COLORS[idx];
  const teamIdForSide = (idx: PoolSideIndex): string | undefined => (isTeamMode ? sides[idx].id : undefined);
  const shooterForSide = (idx: PoolSideIndex): string | undefined =>
    sides[idx].lineup[state.shooterIndexBySide[idx]] ?? sides[idx].lineup[0];

  const currentShooterId = getCurrentShooterId(state);
  const currentShooterProfile = currentShooterId ? profiles.get(currentShooterId) : undefined;
  const isMyTurn = !isSpectator && currentUser?.id === currentShooterId;
  const isGameOver = state.winnerSideIndex !== null || Boolean(match.winner_profile_id) || Boolean(match.winner_team_id);
  const canInteract = !isSpectator && !isTvDisplayMode && (match.status === 'active' || isAdmin) && state.winnerSideIndex === null;
  const canAct = canInteract && !loading && !eventsLoading;

  const recordWinEvent = async (winSide: PoolSideIndex, type: string, data: Record<string, unknown>) => {
    const winnerPlayerId = shooterForSide(winSide);
    await recordEvent(match.id, type, data, winnerPlayerId, teamIdForSide(winSide), currentUser?.id);
  };

  const handlePot = async (ball: number) => {
    if (!canAct || state.balls[ball]?.potted) return;
    const shootingSide = state.currentSideIndex;
    const shooterId = getCurrentShooterId(state);
    if (!shooterId) return;
    const result = applyPoolPot(state, ball);
    if (result.events.length === 0) return;

    setLoading(true);
    try {
      for (const evt of result.events) {
        if (evt.type === 'pool_game_won' && result.winnerSideIndex !== undefined) {
          await recordWinEvent(result.winnerSideIndex, evt.type, evt.data);
        } else {
          await recordEvent(match.id, evt.type, evt.data, shooterId, teamIdForSide(shootingSide), currentUser?.id);
        }
      }
      if (result.winnerSideIndex !== undefined) {
        if (isTeamMode) {
          await completeMatchWithTeamWinner(match.id, sides[result.winnerSideIndex].id);
        } else {
          await completeMatchWithWinner(match.id, sides[result.winnerSideIndex].id);
        }
        onRefresh();
      }
      await refreshEvents();
    } finally {
      setLoading(false);
    }
  };

  const handleMiss = async () => {
    if (!canAct) return;
    const shooterId = getCurrentShooterId(state);
    if (!shooterId) return;
    const teamId = teamIdForSide(state.currentSideIndex);
    setLoading(true);
    try {
      await recordEvent(match.id, 'pool_miss', {}, shooterId, teamId, currentUser?.id);
      await refreshEvents();
    } finally {
      setLoading(false);
    }
  };

  const handleFoul = async () => {
    if (!canAct) return;
    const shooterId = getCurrentShooterId(state);
    if (!shooterId) return;
    const teamId = teamIdForSide(state.currentSideIndex);
    setLoading(true);
    try {
      await recordEvent(match.id, 'pool_foul', { reason: 'cue_ball_potted' }, shooterId, teamId, currentUser?.id);
      await refreshEvents();
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (isSpectator || isTvDisplayMode || loading || eventsLoading || events.length === 0 || (match.status !== 'active' && !isAdmin)) return;
    setLoading(true);
    try {
      const undoesWin = events[events.length - 1]?.event_type === 'pool_game_won';
      await undoLastEvent(match.id);
      if (undoesWin) await undoLastEvent(match.id);
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
          is_practice: match.is_practice,
        })
        .select()
        .single();

      if (matchError) throw matchError;

      if (isTeamMode) {
        const teamIdMap = new Map<string, string>();
        const { data: newTeams, error: teamsError } = await supabase
          .from('match_teams')
          .insert(orderedTeams.map(team => ({
            match_id: newMatch.id,
            team_name: team.team_name,
            team_color: team.team_color,
            sort_order: team.sort_order,
          })))
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
        const { error: playersError } = await supabase.from('match_players').insert(
          players.map(p => ({
            match_id: newMatch.id,
            profile_id: p.profile_id,
            role: p.role,
            batting_order: p.batting_order,
          }))
        );
        if (playersError) throw playersError;
      }

      navigate(`/match/${roomCode}`);
    } catch (err) {
      console.error('Failed to create pool rematch:', err);
    } finally {
      setIsCreatingRematch(false);
    }
  };

  const sideStats = ([0, 1] as PoolSideIndex[]).map(idx => ({
    idx,
    name: sideName(idx),
    color: sideColor(idx),
    clearance: getSideClearance(state, idx),
    group: state.groups[idx],
    pots: state.potsBySide[idx],
    misses: state.missesBySide[idx],
    fouls: state.foulsBySide[idx],
    streak: state.longestStreakBySide[idx],
  }));

  return (
    <div className="flex h-full flex-col bg-charcoal-950">
      <div className="border-b border-charcoal-800 bg-charcoal-900 p-4 shadow-lg">
        <div className="grid grid-cols-2 gap-3 mb-3">
          {sideStats.map(side => (
            <div
              key={side.idx}
              className={`rounded-2xl border p-3 transition-all ${
                !isGameOver && state.currentSideIndex === side.idx
                  ? 'shadow-[0_0_20px_rgba(255,255,255,0.06)]'
                  : 'border-charcoal-700 bg-charcoal-800/50'
              }`}
              style={!isGameOver && state.currentSideIndex === side.idx ? { borderColor: side.color, backgroundColor: `${side.color}1a` } : undefined}
            >
              <p className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: side.color }}>{side.name}</p>
              <p className="text-2xl font-mono font-black text-charcoal-50 leading-none mt-1">
                {side.clearance.potted}<span className="text-charcoal-600 text-sm">/{side.clearance.total}</span>
              </p>
              <p className="text-[10px] uppercase tracking-widest text-charcoal-500 mt-1">
                {side.group ? (side.group === 'bigs' ? 'Bigs (9-15)' : 'Smalls (1-7)') : 'Open table'}
                {side.idx === 0 && <span className="ml-1 text-charcoal-600">&middot; Broke</span>}
              </p>
            </div>
          ))}
        </div>

        {!isGameOver && currentShooterProfile && (
          <div className={`flex items-center gap-4 p-3 rounded-2xl border-2 transition-all ${isMyTurn ? 'border-success-500/50 bg-success-950/20' : 'border-charcoal-700 bg-charcoal-800/50'}`}>
            <UserAvatar display_name={currentShooterProfile.display_name} avatar_color={currentShooterProfile.avatar_color} avatar_url={currentShooterProfile.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: sideColor(state.currentSideIndex) }}>On the Table</p>
              <h3 className="text-lg font-black text-charcoal-50 truncate uppercase tracking-tight">
                {isMyTurn ? 'Your Shot!' : currentShooterProfile.display_name}
              </h3>
            </div>
            {state.turnPotCount >= 2 && (
              <div className="flex items-center gap-1 text-warning-400">
                <Flame size={18} />
                <span className="font-mono font-black">{state.turnPotCount}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isGameOver ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
            <Trophy size={48} className="text-success-500 mb-4" />
            <h2 className="text-2xl font-black text-charcoal-50 mb-2">Match Complete</h2>
            {state.winnerSideIndex !== null && (
              <p className="text-charcoal-400 text-sm mb-6">
                {sideName(state.winnerSideIndex)} wins {state.winMethod === 'legal_black' ? 'on the black' : 'on a foul'}
              </p>
            )}

            <div className="w-full space-y-3">
              {sideStats.map(side => (
                <div key={side.idx} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left">
                  <p className="font-bold text-charcoal-100" style={{ color: side.color }}>{side.name}</p>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-charcoal-500 uppercase">Potted</p>
                      <p className="font-mono text-base font-black text-charcoal-200">{side.pots}</p>
                    </div>
                    <div className="bg-charcoal-900/50 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-charcoal-500 uppercase">Misses</p>
                      <p className="font-mono text-base font-black text-charcoal-200">{side.misses}</p>
                    </div>
                    <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-danger-500/20">
                      <p className="text-[9px] font-bold text-danger-500 uppercase">Fouls</p>
                      <p className="font-mono text-base font-black text-danger-400">{side.fouls}</p>
                    </div>
                    <div className="bg-charcoal-900/50 rounded-lg p-2 text-center border border-warning-500/20">
                      <p className="text-[9px] font-bold text-warning-500 uppercase">Streak</p>
                      <p className="font-mono text-base font-black text-warning-400">{side.streak}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!isSpectator && !isTvDisplayMode && (
              <div className="w-full max-w-sm mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={handleRematch} disabled={isCreatingRematch} className="btn-primary py-3 flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Rematch
                </button>
                <button onClick={() => navigate('/')} className="btn-secondary py-3 flex items-center justify-center gap-2">
                  Dashboard
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
            {POOL_BALL_NUMBERS.map(ball => {
              const ballState = state.balls[ball];
              const ballGroup = ballGroupOf(ball);
              const groupOwnerIdx: PoolSideIndex | null = ballGroup === null ? null : state.groups[0] === ballGroup ? 0 : state.groups[1] === ballGroup ? 1 : null;
              const borderColor = !ballState.potted && groupOwnerIdx !== null ? sideColor(groupOwnerIdx) : undefined;
              return (
                <button
                  key={ball}
                  onClick={() => handlePot(ball)}
                  disabled={!canAct || ballState.potted}
                  className={`aspect-square rounded-full flex items-center justify-center font-black text-lg shadow-lg transition-all active:scale-90 border-2 ${
                    ballState.potted ? 'opacity-25 grayscale border-transparent' : 'border-white/10'
                  }`}
                  style={{ ...ballStyle(ball), borderColor: !ballState.potted ? borderColor : undefined }}
                >
                  <span className={`${ball <= 7 || ball === 8 ? 'text-white' : 'text-charcoal-950'} drop-shadow`}>{ball}</span>
                </button>
              );
            })}
            <button
              onClick={handleFoul}
              disabled={!canAct}
              className="aspect-square rounded-full flex items-center justify-center bg-charcoal-800 border-2 border-dashed border-charcoal-500 active:scale-90 transition-all"
              title="Cue ball potted (foul)"
            >
              <Circle size={22} className="text-charcoal-300" />
            </button>
          </div>
        )}

        {!isSpectator && !isTvDisplayMode && !isGameOver && (
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3 pt-2">
            <button onClick={handleMiss} disabled={!canAct} className="btn-secondary py-3 flex items-center justify-center gap-2">
              Miss / Pass Turn
            </button>
            <button onClick={handleUndo} disabled={loading || eventsLoading || events.length === 0 || (match.status !== 'active' && !isAdmin)} className="py-3 rounded-xl bg-charcoal-800 border border-charcoal-700 text-charcoal-400 text-sm font-bold flex items-center justify-center gap-2">
              <RotateCcw size={14} /> Undo
            </button>
          </div>
        )}
      </div>

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
