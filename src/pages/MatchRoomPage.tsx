import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, MoreVertical, CheckCircle, Pause, Play, Users, Search, Plus, X } from 'lucide-react';
import { getMatchByCode, getMatchTeams, getMatchPlayers, updateMatchStatus, getSportIcon, getSportLabel } from '../lib/matches';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getAllProfiles } from '../lib/auth';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import QRCodeModal from '../components/QRCodeModal';
import CricketRoom from '../components/sports/CricketRoom';
import GolfRoom from '../components/sports/GolfRoom';
import ChipOffRoom from '../components/sports/ChipOffRoom';
import DartsRoom from '../components/sports/DartsRoom';
import TableTennisRoom from '../components/sports/TableTennisRoom';
import PoolRoom from '../components/sports/PoolRoom';
import BasketballRoom from '../components/sports/BasketballRoom';
import CardsRoom from '../components/sports/CardsRoom';
import CustomRoom from '../components/sports/CustomRoom';
import type { MatchRoom, MatchTeam, MatchPlayer, Profile } from '../lib/supabase';

export type MatchContext = {
  match: MatchRoom;
  teams: MatchTeam[];
  players: MatchPlayer[];
  profiles: Map<string, Profile>;
  isSpectator: boolean;
  currentUser: Profile | null;
  isAdmin: boolean;
  isBackyard: boolean;
  onRefresh: () => void;
};

export default function MatchRoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { currentUser, isAdmin, sessionId } = useAuth();

  const [match, setMatch] = useState<MatchRoom | null>(null);
  const [teams, setTeams] = useState<MatchTeam[]>([]);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const [showQR, setShowQR] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showEditRoster, setShowEditRoster] = useState(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isAddingGuest, setIsAddingGuest] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (showEditRoster) {
      getAllProfiles().then(setAllProfiles).catch(console.error);
    }
  }, [showEditRoster]);

  const loadMatch = useCallback(async (isMounted?: () => boolean) => {
    if (!roomCode) return;
    
    try {
      setLoading(true);
      const m = await getMatchByCode(roomCode);
      
      if (isMounted && !isMounted()) return;

      if (!m) { 
        navigate('/'); 
        return; 
      }
      setMatch(m);

      const [t, p] = await Promise.all([
        getMatchTeams(m.id),
        getMatchPlayers(m.id),
      ]);

      if (isMounted && !isMounted()) return;

      setTeams(t || []);
      setPlayers(p || []);

      // Load all profiles
      const pids = [...new Set((p || []).map(mp => mp.profile_id))];
      if (pids.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .in('id', pids);
        
        if (isMounted && !isMounted()) return;

        const map = new Map((data || []).map((pr: Profile) => [pr.id, pr]));
        setProfiles(map);
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'AbortError') return;
      console.error("Error loading match:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [roomCode, navigate]);

  useEffect(() => {
    let mounted = true;
    loadMatch(() => mounted);
    return () => { mounted = false; };
  }, [loadMatch]);

  // Subscribe to realtime updates for this match
  useEffect(() => {
    if (!match) return;
    
    const channel = supabase
      .channel(`match-room:${match.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_rooms', filter: `id=eq.${match.id}` },
        (payload) => {
          // Only refresh if status changed or important metadata changed
          const oldStatus = match.status;
          const newStatus = payload.new.status;
          if (oldStatus !== newStatus) {
            loadMatch();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [match?.id, match?.status, loadMatch]);

  // Update session with match
  useEffect(() => {
    if (!match || !sessionId) return;
    supabase
      .from('active_sessions')
      .update({ match_id: match.id })
      .eq('id', sessionId);
    return () => {
      supabase
        .from('active_sessions')
        .update({ match_id: null })
        .eq('id', sessionId);
    };
  }, [match?.id, sessionId]);

  const handlePause = async () => {
    if (!match) return;
    await updateMatchStatus(match.id, match.status === 'paused' ? 'active' : 'paused');
    await loadMatch();
    setShowMenu(false);
  };

  const handleEnd = async () => {
    if (!match) return;
    await updateMatchStatus(match.id, 'completed');
    await loadMatch();
    setShowEndConfirm(false);
    setShowMenu(false);
  };

  const handleAddPlayer = async (profileId: string) => {
    if (!match) return;
    try {
      const { error } = await supabase
        .from('match_players')
        .insert({
          match_id: match.id,
          profile_id: profileId,
          role: 'player',
          batting_order: players.length + 1
        });
      if (error) throw error;
      await loadMatch();
    } catch (err) {
      console.error("Failed to add player:", err);
      alert("Failed to add player.");
    }
  };

  const handleRemovePlayer = async (profileId: string) => {
    if (!match) return;
    try {
      // Check if player has events
      const { count, error: countError } = await supabase
        .from('match_events')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', match.id)
        .eq('player_id', profileId);
      
      if (countError) throw countError;
      
      if (count && count > 0) {
        alert("Cannot remove player who has already participated in the match.");
        return;
      }

      const { error } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', match.id)
        .eq('profile_id', profileId);
      
      if (error) throw error;
      await loadMatch();
    } catch (err) {
      console.error("Failed to remove player:", err);
      alert("Failed to remove player.");
    }
  };

  const handleAddGuest = async () => {
    if (!match || !guestName.trim()) return;
    setIsAddingGuest(true);
    try {
      const guestUsername = `guest_${Date.now()}`;
      const { data: newGuest, error } = await supabase
        .from('profiles')
        .insert([{
          username: guestUsername,
          display_name: guestName.trim(),
          avatar_color: '#f59e0b',
          is_guest: true
        }])
        .select()
        .single();

      if (error) throw error;
      if (newGuest) {
        await handleAddPlayer(newGuest.id);
        setGuestName('');
      }
    } catch (err) {
      console.error("Failed to add guest:", err);
      alert("Failed to add guest.");
    } finally {
      setIsAddingGuest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-charcoal-400">Loading match...</p>
        </div>
      </div>
    );
  }

  if (!match) return null;

  // --- ADD THESE LINES TO DETECT MODE ---
  // Backyard mode check, defaulting to false if undefined
  const isBackyard = match.house_rules?.variant === 'backyard';
  // --------------------------------------

  const context: MatchContext = {
    match,
    teams,
    players,
    profiles,
    isSpectator: false,
    currentUser,
    isAdmin,
    isBackyard: match.house_rules?.variant === 'backyard',
    onRefresh: loadMatch
  };
  

  const SportRoom = getSportRoom(match);

  return (
    <div className="min-h-screen bg-charcoal-900 flex flex-col">
      {/* Header */}
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-3 safe-top flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getSportIcon(match.sport)}</span>
              <h1 className="font-bold text-charcoal-50 truncate">
                {getSportLabel(match.sport, match.custom_game_name)}
              </h1>
              <span className={`pill text-xs flex-shrink-0 ${
                match.status === 'active' ? 'pill-active' :
                match.status === 'paused' ? 'pill-paused' : 'pill-completed'
              }`}>
                {match.status === 'active' ? 'Live' : match.status === 'paused' ? 'Paused' : 'Done'}
              </span>
            </div>
            <p className="text-charcoal-500 text-xs font-mono mt-0.5">{match.room_code}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowQR(true)}
              className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-400 transition-colors"
            >
              <Share2 size={18} />
            </button>
            {match.status !== 'completed' && (
              <button
                onClick={() => setShowMenu(true)}
                className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-400 transition-colors"
              >
                <MoreVertical size={18} />
              </button>
            )}
          </div>
        </div>
        {/* Players row */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar">
          {Array.from(profiles.values()).map(p => (
            <div key={p.id} className="flex items-center gap-1.5 flex-shrink-0">
              <Avatar name={p.display_name} color={p.avatar_color} size="xs" />
              <span className="text-charcoal-300 text-xs">{p.display_name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sport-specific room */}
      <div className="flex-1 overflow-hidden">
        <SportRoom ctx={context} />
      </div>

      {/* QR Modal */}
      {showQR && <QRCodeModal match={match} onClose={() => setShowQR(false)} />}

      {/* Match menu */}
      <Modal isOpen={showMenu} onClose={() => setShowMenu(false)} title="Match Options">
        <div className="space-y-2">
          <button
            onClick={handlePause}
            className="w-full btn-secondary flex items-center gap-3 justify-start"
          >
            {match.status === 'paused' ? <Play size={18} /> : <Pause size={18} />}
            {match.status === 'paused' ? 'Resume Match' : 'Pause Match'}
          </button>
          <button
            onClick={() => { setShowMenu(false); setShowEditRoster(true); }}
            className="w-full btn-secondary flex items-center gap-3 justify-start"
          >
            <Users size={18} />
            Edit Roster
          </button>
          <button
            onClick={() => { setShowMenu(false); setShowEndConfirm(true); }}
            className="w-full btn-danger flex items-center gap-3 justify-start"
          >
            <CheckCircle size={18} />
            End & Lock Match
          </button>
        </div>
      </Modal>

      {/* Edit Roster Modal */}
      <Modal isOpen={showEditRoster} onClose={() => setShowEditRoster(false)} title="Manage Roster">
        <div className="space-y-4 max-h-[70vh] flex flex-col">
          {/* Current Roster */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-charcoal-500 uppercase tracking-widest">Active Players</h3>
            <div className="flex flex-wrap gap-2">
              {players.map(p => {
                const profile = profiles.get(p.profile_id);
                if (!profile) return null;
                return (
                  <div key={p.profile_id} className="flex items-center gap-1.5 bg-charcoal-800 rounded-full pl-1 pr-2 py-1 border border-charcoal-700">
                    <Avatar name={profile.display_name} color={profile.avatar_color} size="xs" />
                    <span className="text-charcoal-200 text-xs">{profile.display_name}</span>
                    <button 
                      onClick={() => handleRemovePlayer(p.profile_id)}
                      className="text-charcoal-500 hover:text-danger-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="divider border-charcoal-700" />

          {/* Add Player */}
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-black text-charcoal-500 uppercase tracking-widest">Add to Match</h3>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500" />
              <input 
                type="text" 
                value={playerSearch} 
                onChange={e => setPlayerSearch(e.target.value)} 
                className="input-field pl-9 py-2 text-sm" 
                placeholder="Search registered players..." 
              />
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {allProfiles
                .filter(p => 
                  !players.some(mp => mp.profile_id === p.id) &&
                  (p.display_name.toLowerCase().includes(playerSearch.toLowerCase()) || 
                   p.username?.toLowerCase().includes(playerSearch.toLowerCase()))
                )
                .slice(0, 10)
                .map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => handleAddPlayer(p.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-charcoal-800 transition-colors text-left"
                  >
                    <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
                    <span className="text-charcoal-200 text-sm font-medium">{p.display_name}</span>
                    <Plus size={14} className="ml-auto text-charcoal-500" />
                  </button>
                ))
              }
            </div>

            <div className="pt-2 border-t border-charcoal-700">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={guestName} 
                  onChange={e => setGuestName(e.target.value)} 
                  className="input-field py-2 text-sm" 
                  placeholder="New guest name..." 
                />
                <button 
                  onClick={handleAddGuest}
                  disabled={!guestName.trim() || isAddingGuest}
                  className="btn-secondary px-4 text-xs font-bold"
                >
                  Add Guest
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* End confirm */}
      <Modal isOpen={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Match?">
        <div className="space-y-4">
          <p className="text-charcoal-300 text-sm">
            This will lock the scorecard. Previous scores cannot be edited unless an admin unlocks it.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowEndConfirm(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleEnd} className="btn-danger flex-1">End & Lock</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function getSportRoom(match: MatchRoom): React.ComponentType<{ ctx: MatchContext }> {
  const sport = match.sport;
  const variant = (match.house_rules as any)?.variant;

  if (sport === 'golf' && variant === 'chip_off') {
    return ChipOffRoom;
  }

  const rooms: Record<string, React.ComponentType<{ ctx: MatchContext }>> = {
    cricket: CricketRoom,
    golf: GolfRoom,
    darts: DartsRoom,
    table_tennis: TableTennisRoom,
    pool: PoolRoom,
    basketball: BasketballRoom,
    cards: CardsRoom,
    custom: CustomRoom,
  };
  return rooms[sport] || CustomRoom;
}
