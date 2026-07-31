// TEMPLATE — not a real sport room. Not imported by MatchRoomPage.tsx or
// SpectatorPage.tsx, so it is dead code by design; copy this file to a real
// name (`FooRoom.tsx`) and follow the wiring checklist in
// docs/sport-room-template.md rather than editing this file in place.
//
// Modeled on ChipOffRoom.tsx, the most complete room in the app. Every
// numbered section below corresponds to a numbered section in
// docs/sport-room-template.md — read that doc alongside this file.
import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent, undoLastEvent, completeMatchWithWinner, completeMatchWithTeamWinner, generateRoomCode } from '../../lib/matches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import UserAvatar from '../UserAvatar';
import { useNavigate } from 'react-router-dom';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile, MatchEvent, MatchTeam } from '../../lib/supabase';
import { Trophy, RotateCcw, AlertCircle, ArrowLeft } from 'lucide-react';

// Rename this event_type before copying, and add a matching WHEN branch to
// the match_event_points() Postgres function (a migration) — see point 5.
const SCORE_EVENT_TYPE = 'template_score';

interface TemplateRules {
  target_score?: number;
  team_play?: boolean;
}

export default function TemplateRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, teams, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;

  // --- Point 2: guard writes inside handlers, not just JSX -----------------
  // Never substitute `match.status !== 'completed'` here — that's also true
  // while paused.
  const canInteract = match.status === 'active' || isAdmin;

  const rules = (match.house_rules || {}) as TemplateRules;
  const targetScore = rules.target_score || 21;
  const isTeamMode = Boolean(rules.team_play) && teams.length >= 2;

  // --- Point 1: rehydrate + live-sync from match_events ---------------------
  const { events, loading: eventsLoading, refresh: refreshEvents } = useMatchEvents(match.id);

  const [loading, setLoading] = useState(false);
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const navigate = useNavigate();

  const matchPlayers = useMemo(() =>
    players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[]
  , [players, profiles]);

  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [teams]
  );

  // Whose turn it is comes from the roster + house rules, not the event
  // reduction below — swap for real turn-order logic (see ChipOffRoom's
  // `rotation`/`teamLineups` for the team-interleaving version).
  const currentPlayer = matchPlayers[0];
  const currentTeamId = isTeamMode ? players.find(p => p.profile_id === currentPlayer?.id)?.team_id ?? undefined : undefined;
  const isMyTurn = !isSpectator && currentUser?.id === currentPlayer?.id;

  // Derive all displayed state from the event log in one pass — don't keep
  // score in local useState that only your own writes update; another
  // device's write must show up here too.
  const gameStats = useMemo(() => {
    const totals = new Map<string, number>();
    matchPlayers.forEach(p => totals.set(p.id, 0));

    for (const event of events as MatchEvent[]) {
      if (event.event_type !== SCORE_EVENT_TYPE) continue;
      const pId = event.player_id;
      if (!pId) continue; // point 5: this event should never happen — every record call below passes player_id
      const points = (event.event_data.points as number) || 0;
      totals.set(pId, (totals.get(pId) || 0) + points);
    }

    const teamTotals = isTeamMode
      ? orderedTeams.map(team => {
          const memberIds = players.filter(p => p.team_id === team.id).map(p => p.profile_id);
          const total = memberIds.reduce((sum, pid) => sum + (totals.get(pid) || 0), 0);
          return { team, total };
        })
      : [];

    const isGameOver = isTeamMode
      ? teamTotals.some(t => t.total >= targetScore)
      : [...totals.values()].some(v => v >= targetScore);

    return { totals, teamTotals, isGameOver };
  }, [events, matchPlayers, isTeamMode, orderedTeams, players, targetScore]);

  const sortedLeaderboard = [...matchPlayers].sort(
    (a, b) => (gameStats.totals.get(b.id) || 0) - (gameStats.totals.get(a.id) || 0)
  );

  // --- Point 4: explicit win condition ---------------------------------------
  const handleScore = async (points: number) => {
    if (!currentPlayer || loading || eventsLoading || isSpectator || !canInteract) return;
    setLoading(true);
    try {
      // Point 5: player_id always passed, even in team mode — omitting it
      // is how cards_round/tt_set/custom_score currently score nothing.
      await recordEvent(match.id, SCORE_EVENT_TYPE, { points }, currentPlayer.id, currentTeamId, currentUser?.id);

      const newTotal = (gameStats.totals.get(currentPlayer.id) || 0) + points;
      if (newTotal >= targetScore) {
        if (isTeamMode && currentTeamId) {
          await completeMatchWithTeamWinner(match.id, currentTeamId);
        } else {
          await completeMatchWithWinner(match.id, currentPlayer.id);
        }
        ctx.onRefresh();
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

  // Clones match_rooms + match_teams + match_players into a fresh room.
  // Copy near-verbatim from ChipOffRoom.handleRematch — the team-ID
  // remapping (teamIdMap) is easy to get subtly wrong from scratch.
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
      console.error('Failed to create rematch:', err);
    } finally {
      setIsCreatingRematch(false);
    }
  };

  // --- Point 3: spectator / TV-display mode is read-only ---------------------
  const showSummary = gameStats.isGameOver || match.winner_profile_id || match.winner_team_id || isSpectator || isTvDisplayMode;

  return (
    <div className="flex flex-col h-full bg-charcoal-950 overflow-hidden">
      <div className="bg-charcoal-900 border-b border-charcoal-800 p-4 shadow-lg z-10">
        <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-charcoal-700 bg-charcoal-800/50">
          {currentPlayer && (
            <>
              <UserAvatar display_name={currentPlayer.display_name} avatar_color={currentPlayer.avatar_color} avatar_url={currentPlayer.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Active Player</p>
                <h3 className="text-xl font-black text-charcoal-50 truncate uppercase tracking-tight">
                  {isMyTurn ? 'Your Turn!' : currentPlayer.display_name}
                </h3>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {showSummary ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
            {(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id) && <Trophy size={48} className="text-emerald-500 mb-4" />}
            <h2 className="text-2xl font-black text-charcoal-50 mb-6">
              {(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id) ? 'Match Complete' : 'Live Leaderboard'}
            </h2>

            <div className="w-full space-y-2">
              {sortedLeaderboard.map((p, idx) => (
                <div key={p.id} className="bg-charcoal-800 rounded-xl p-4 border border-charcoal-700 text-left flex items-center gap-3">
                  <div className="w-6 text-center font-mono font-black text-charcoal-500 text-sm">{idx + 1}</div>
                  <UserAvatar display_name={p.display_name} avatar_color={p.avatar_color} avatar_url={p.avatar_url} size="sm" />
                  <span className="font-bold text-charcoal-100 flex-1 truncate">{p.display_name}</span>
                  <span className="font-mono text-xl font-black text-charcoal-50">{gameStats.totals.get(p.id) || 0}</span>
                </div>
              ))}
            </div>

            {!isSpectator && !isTvDisplayMode && (
              <div className="w-full max-w-sm mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={handleRematch} disabled={isCreatingRematch} className="btn-primary py-3 flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Rematch
                </button>
                <button onClick={() => navigate('/')} className="btn-secondary py-3 flex items-center justify-center gap-2">
                  <ArrowLeft size={18} /> Dashboard
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-w-md mx-auto">
            {/* Replace with the sport's real scoring controls. Every button
                must call a handler that itself checks canInteract/loading/
                eventsLoading — never rely on `disabled` alone. */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(points => (
                <button
                  key={points}
                  onClick={() => handleScore(points)}
                  disabled={loading || eventsLoading || !canInteract}
                  className="py-6 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 active:scale-95 transition-all flex flex-col items-center"
                >
                  <span className="text-3xl font-black text-emerald-400 leading-none">+{points}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleUndo}
              disabled={loading || eventsLoading || !canInteract || events.length === 0}
              className="w-full py-3 rounded-xl bg-charcoal-800 border border-charcoal-700 text-charcoal-400 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} /> Undo Last Score
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
