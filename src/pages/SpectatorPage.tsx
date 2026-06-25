import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getMatchByCode, getMatchTeams, getMatchPlayers, getSportIcon, getSportLabel } from '../lib/matches';
import { supabase } from '../lib/supabase';
import CricketRoom from '../components/sports/CricketRoom';
import GolfRoom from '../components/sports/GolfRoom';
import DartsRoom from '../components/sports/DartsRoom';
import TableTennisRoom from '../components/sports/TableTennisRoom';
import PoolRoom from '../components/sports/PoolRoom';
import BasketballRoom from '../components/sports/BasketballRoom';
import CardsRoom from '../components/sports/CardsRoom';
import CustomRoom from '../components/sports/CustomRoom';
import type { MatchRoom, MatchTeam, MatchPlayer, Profile } from '../lib/supabase';
import type { MatchContext } from './MatchRoomPage';

const sportRooms: Record<string, React.ComponentType<{ ctx: MatchContext }>> = {
  cricket: CricketRoom,
  golf: GolfRoom,
  darts: DartsRoom,
  table_tennis: TableTennisRoom,
  pool: PoolRoom,
  basketball: BasketballRoom,
  cards: CardsRoom,
  custom: CustomRoom,
};

export default function SpectatorPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [match, setMatch] = useState<MatchRoom | null>(null);
  const [teams, setTeams] = useState<MatchTeam[]>([]);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!roomCode) return;
    const m = await getMatchByCode(roomCode);
    if (!m) { setLoading(false); return; }
    setMatch(m);

    const [t, p] = await Promise.all([getMatchTeams(m.id), getMatchPlayers(m.id)]);
    setTeams(t);
    setPlayers(p);

    const pids = [...new Set(p.map((mp: MatchPlayer) => mp.profile_id))];
    if (pids.length > 0) {
      const { data } = await supabase.from('profiles').select('*').in('id', pids);
      setProfiles(new Map((data || []).map((pr: Profile) => [pr.id, pr])));
    }
    setLoading(false);
  }, [roomCode]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!match) return;
    const channel = supabase
      .channel(`spectate:${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_rooms', filter: `id=eq.${match.id}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cricket_innings', filter: `match_id=eq.${match.id}` }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match?.id, loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-charcoal-300 text-lg">Connecting to match...</p>
          <p className="text-charcoal-500 text-sm font-mono mt-1">{roomCode}</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-center p-6">
        <div>
          <p className="text-5xl mb-4">🏟️</p>
          <h1 className="text-2xl font-bold text-charcoal-100 mb-2">Match Not Found</h1>
          <p className="text-charcoal-400">Room <span className="font-mono">{roomCode}</span> doesn't exist.</p>
        </div>
      </div>
    );
  }

  const SportRoom = sportRooms[match.sport] || CustomRoom;
  const ctx: MatchContext = {
    match,
    teams,
    players,
    profiles,
    isSpectator: true,
    currentUser: null,
    isAdmin: false,
    onRefresh: loadData,
  };

  return (
    <div className="min-h-screen bg-charcoal-900 flex flex-col">
      {/* Spectator header */}
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getSportIcon(match.sport)}</span>
              <h1 className="text-2xl font-black text-charcoal-50">
                {getSportLabel(match.sport, match.custom_game_name)}
              </h1>
              {match.status === 'active' && (
                <div className="flex items-center gap-1.5 bg-success-600/20 border border-success-600/30 rounded-full px-3 py-1">
                  <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
                  <span className="text-success-400 text-sm font-semibold">LIVE</span>
                </div>
              )}
            </div>
            <p className="text-charcoal-400 text-sm mt-0.5 font-mono">{match.room_code}</p>
          </div>
          <div className="text-right">
            <p className="text-charcoal-500 text-xs">Spectator View</p>
            <p className="text-charcoal-400 text-xs">{new Date(match.started_at || match.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Match display */}
      <div className="flex-1 overflow-hidden max-w-4xl mx-auto w-full">
        <SportRoom ctx={ctx} />
      </div>
    </div>
  );
}