import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, MoreVertical, CheckCircle, Pause, Play } from 'lucide-react';
import { getMatchByCode, getMatchTeams, getMatchPlayers, updateMatchStatus, getSportIcon, getSportLabel } from '../lib/matches';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

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
            onClick={() => { setShowMenu(false); setShowEndConfirm(true); }}
            className="w-full btn-danger flex items-center gap-3 justify-start"
          >
            <CheckCircle size={18} />
            End & Lock Match
          </button>
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
