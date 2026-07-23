import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Users, User, Plus, X,
  Check, Search, Settings, AlertCircle
} from 'lucide-react';
import { getAllProfiles } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import InfoTooltip from '../components/InfoTooltip';
import LineupOrderBuilder from '../components/LineupOrderBuilder';
import { getRuleDefinition } from '../data/ruleDefinitions';
import type { Profile } from '../lib/supabase';
import { SAFE_PROFILE_COLUMNS } from '../lib/supabase';

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. http:// IP access)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SPORTS = [
  { id: 'cricket', label: 'Cricket', icon: '🏏', team: true, desc: 'Traditional or backyard match types' },
  { id: 'golf', label: 'Golf', icon: '⛳', team: false, desc: '9 or 18-hole scorecard with par tracking' },
  { id: 'darts', label: 'Darts', icon: '🎯', team: false, desc: 'Standard countdown, elimination, or round-the-board mini games.' },
  { id: 'table_tennis', label: 'Table Tennis', icon: '🏓', team: true, desc: 'Win-by-2 game tracking' },
  { id: 'pool', label: '8-Ball Pool', icon: '🎱', team: true, desc: 'Frame tracking & golden breaks' },
  { id: 'basketball', label: 'Basketball', icon: '🏀', team: true, desc: '1/2/3 point tracking with players' },
  { id: 'cards', label: 'Card Games', icon: '🃏', team: false, desc: 'End-of-round grid scoring' },
  { id: 'custom', label: 'Custom Sport', icon: '🎮', team: null, desc: 'Build your own scoring interface' },
];

type DartsVariant = 'countdown' | 'around_the_world' | 'killer';
type DartsRingRule = 'any_segment' | 'doubles_only' | 'triples_only';

const DARTS_MODE_META: Record<DartsVariant, {
  title: string;
  description: string;
  summary: string;
}> = {
  countdown: {
    title: '501 / 301 Countdown',
    description: 'Classic countdown scoring with custom checkout rules.',
    summary: 'Players start with a set score and race to reduce it to exactly 0. Each player gets 3 throws per turn. If a throw drops the score below 0 (or to 1 if Double-Out is on), the turn is a Bust and resets.',
  },
  around_the_world: {
    title: 'Around the World',
    description: 'A chronological race to hit segments 1 through 20 and the Bullseye.',
    summary: 'A chronological race around the dartboard. Every player starts targeting segment 1 and cannot advance to the next number until it is successfully hit. The first player to hit all segments up to 20 and finish on the Bullseye wins.',
  },
  killer: {
    title: 'Killer',
    description: "Multiplayer elimination game. Become a killer to hunt your opponents' lives.",
    summary: "Each player must first hit their assigned number segment (or specific ring) to activate 'Killer' status. Once achieved, you score points by hitting your opponents' segments to eliminate their lives. Last player standing wins.",
  },
};

const PIZZA_PUTT_COURSE = [
  { number: 1, name: 'The Bears Den', par: 2 },
  { number: 2, name: 'The Jungle', par: 3 },
  { number: 3, name: 'Under The Sea', par: 3 },
  { number: 4, name: 'Grand Canyon', par: 3 },
  { number: 5, name: 'Tiki', par: 3 },
  { number: 6, name: 'Mount Rushmore', par: 2 },
  { number: 7, name: 'Glacier', par: 2 },
  { number: 8, name: 'Egypt', par: 3 },
  { number: 9, name: 'The Castle', par: 2 },
  { number: 10, name: 'The Ski Jump', par: 2 },
  { number: 11, name: 'Stone Henge', par: 3 },
];

// Added dedicated sub-steps for sports with multiple setup modes
type Step = 'sport' | 'cricket_variant' | 'golf_variant' | 'darts_variant' | 'config' | 'players';

export default function NewMatchPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [step, setStep] = useState<Step>('sport');
  const [selectedSport, setSelectedSport] = useState('');
  const [cricketVariant, setCricketVariant] = useState<'classic' | 'backyard' | null>(null);
  const [golfVariant, setGolfVariant] = useState<'classic' | 'chip_off' | 'putt_vs_putt' | null>(null);
  const [dartsVariant, setDartsVariant] = useState<DartsVariant | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Custom config
  const [customName, setCustomName] = useState('');
  const [matchTime, setMatchTime] = useState(new Date().toISOString().slice(0, 16));
  const [customIsTeam] = useState(false);
  const [customWinCondition] = useState<'highest' | 'lowest'>('highest');
  const [customButtons] = useState([
    { label: '+1 Point', value: 1 },
    { label: '+5 Points', value: 5 },
  ]);

  // House rules
  const [houseRules, setHouseRules] = useState<Record<string, unknown>>({});

  // Golf specific
  const [golfCourse, setGolfCourse] = useState<{ number: number; name: string; par: number }[]>(
    Array.from({ length: 18 }, (_, i) => ({ number: i + 1, name: '', par: 4 }))
  );

  // Teams/Players
  const [team1Name, setTeam1Name] = useState('Team 1');
  const [team2Name, setTeam2Name] = useState('Team 2');
  const [team1Players, setTeam1Players] = useState<Profile[]>([]);
  const [team2Players, setTeam2Players] = useState<Profile[]>([]);
  const [individualPlayers, setIndividualPlayers] = useState<Profile[]>([]);

  const [playerSearch, setPlayerSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [, setAddingGuest] = useState(false);
  const [activeTeamPicker, setActiveTeamPicker] = useState<'team1' | 'team2' | 'individual' | null>(null);

  const [, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPractice, setIsPractice] = useState(false);

  const activeUser = currentUser;

  useEffect(() => {
    let mounted = true;
    
    setLoading(true);
    getAllProfiles()
      .then(data => {
        if (mounted) {
          setProfiles(data);
          setError('');
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("Failed to fetch profiles:", err);
          setError('Failed to load players. Please check your connection.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    
    if (activeUser) {
      setIndividualPlayers([activeUser]);
      setTeam1Players([activeUser]);
    }
    
    return () => { mounted = false; };
  }, [currentUser]);
  useEffect(() => {
    if (cricketVariant === 'backyard') {
      setHouseRules({
        no_noballs: false,
        no_wides: false
      });
    }
  }, [cricketVariant]);
  const sport = SPORTS.find(s => s.id === selectedSport);
  const dartsModeMeta = dartsVariant ? DARTS_MODE_META[dartsVariant] : null;
  const effectiveHouseRules = {
    ...houseRules,
    variant:
      selectedSport === 'cricket'
        ? cricketVariant
        : selectedSport === 'golf'
          ? golfVariant
          : selectedSport === 'darts'
            ? dartsVariant
            : null,
  };
  const isPuttVsPutt = selectedSport === 'golf' && golfVariant === 'putt_vs_putt';
  
  // Backyard mode forces an individual format setup
  // Practice mode also defaults to individual format to allow flexible multi-player "nets"
  const isTeam = isPuttVsPutt
    ? true
    : isPractice 
    ? false 
    : selectedSport === 'custom' 
      ? customIsTeam 
      : selectedSport === 'cricket'
        ? cricketVariant === 'classic'
        : (sport?.team ?? false);

  const filteredProfiles = profiles.filter(p =>
    p.display_name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.username && p.username.toLowerCase().includes(playerSearch.toLowerCase()))
  );

  const allSelectedIds = new Set([
    ...team1Players.map(p => p.id),
    ...team2Players.map(p => p.id),
    ...individualPlayers.map(p => p.id),
  ]);

  const addPlayerToGroup = (profile: Profile, target: 'team1' | 'team2' | 'individual') => {
    if (target === 'team1') setTeam1Players(prev => [...prev, profile]);
    else if (target === 'team2') setTeam2Players(prev => [...prev, profile]);
    else setIndividualPlayers(prev => [...prev, profile]);
    setPlayerSearch('');
    setActiveTeamPicker(null);
  };

  const removePlayerFromGroup = (id: string, target: 'team1' | 'team2' | 'individual') => {
    if (target === 'team1') setTeam1Players(prev => prev.filter(p => p.id !== id));
    else if (target === 'team2') setTeam2Players(prev => prev.filter(p => p.id !== id));
    else setIndividualPlayers(prev => prev.filter(p => p.id !== id));
  };

  const handleAddGuest = async () => {
    if (!guestName.trim()) return;
    setAddingGuest(true);
    try {
      // Generate a unique username for the guest using a secure random string
      const guestUsername = `guest_${generateUUID().split('-')[0]}`;
      
      const { data: newGuest, error } = await supabase
        .from('profiles')
        .insert([
          {
            username: guestUsername,
            display_name: guestName.trim(),
            avatar_color: '#f59e0b',
            is_guest: true
          }
        ])
        .select(SAFE_PROFILE_COLUMNS)
        .single();

      if (error) throw error;

      if (newGuest) {
        const safeGuest = { ...newGuest, pin_hash: null };
        setProfiles(prev => [...prev, safeGuest]);
        if (activeTeamPicker) addPlayerToGroup(safeGuest, activeTeamPicker);
        setGuestName('');
      }
    } catch (err) {
      console.error("Failed to add guest:", err);
      alert("Failed to add guest. Please try again.");
    } finally {
      setAddingGuest(false);
    }
  };

  const handleNavigationBack = () => {
    if (step === 'sport') navigate(-1);
    else if (step === 'cricket_variant') setStep('sport');
    else if (step === 'golf_variant') setStep('sport');
    else if (step === 'darts_variant') setStep('sport');
    else if (step === 'config') {
      if (selectedSport === 'cricket') setStep('cricket_variant');
      else if (selectedSport === 'golf') setStep('golf_variant');
      else if (selectedSport === 'darts') setStep('darts_variant');
      else setStep('sport');
    } else if (step === 'players') setStep('config');
  };

  const handleCreateMatch = async () => {
    if (isTeam ? (team1Players.length < 1 || team2Players.length < 1) : individualPlayers.length < 1) return;
    setLoading(true);
    setError('');
  
    try {
      // 1. Generate IDs and Room Code
      const matchId = generateUUID();
      // Use the first segment of a UUID for a secure 8-character room code
      const roomCode = generateUUID().split('-')[0].toUpperCase();

      // 2. Insert the match record
      const { error: matchError } = await supabase
        .from('match_rooms')
        .insert({
          id: matchId,
          room_code: roomCode,
          sport: selectedSport,
          custom_game_name: customName.trim() || (selectedSport === 'custom' ? 'Custom Game' : null),
          match_time: new Date(matchTime).toISOString(),
          status: 'active',
          is_practice: isPractice,
          created_by: currentUser?.id || null,
          house_rules: {
            ...effectiveHouseRules,
            course_data: selectedSport === 'golf' && golfVariant === 'classic' ? golfCourse : null,
            holes:
              selectedSport === 'golf'
                ? golfVariant === 'chip_off'
                  ? (houseRules.total_rounds as number || 9)
                  : golfVariant === 'putt_vs_putt'
                    ? 2
                    : golfCourse.length
                : null,
          },
          custom_config: selectedSport === 'custom' ? {
            is_team: customIsTeam,
            win_condition: customWinCondition,
            buttons: customButtons
          } : {
            cricket_variant: cricketVariant || null,
            golf_variant: golfVariant || null,
            darts_sub_mode_id: dartsVariant || null
          }
        });
  
      if (matchError) throw matchError;

      // 3. Setup Teams and Players
      let team1Id: string | null = null;
      let team2Id: string | null = null;

      if (isTeam || (selectedSport === 'cricket' && cricketVariant === 'classic')) {
        team1Id = generateUUID();
        team2Id = generateUUID();

          // Create Team 1
          const { error: t1Error } = await supabase
            .from('match_teams')
            .insert({ id: team1Id, match_id: matchId, team_name: team1Name, team_color: '#3b82f6', sort_order: 0 });
          if (t1Error) throw t1Error;

          // Create Team 2
          const { error: t2Error } = await supabase
            .from('match_teams')
            .insert({ id: team2Id, match_id: matchId, team_name: team2Name, team_color: '#ef4444', sort_order: 1 });
          if (t2Error) throw t2Error;

          // Add Team 1 Players
          const t1PlayersData = team1Players.map(p => ({
            id: generateUUID(),
            match_id: matchId,
            profile_id: p.id,
            team_id: team1Id,
            lineup_order: isPuttVsPutt ? team1Players.findIndex(player => player.id === p.id) + 1 : null,
            role: 'player'
          }));

          // Add Team 2 Players
          const t2PlayersData = team2Players.map(p => ({
            id: generateUUID(),
            match_id: matchId,
            profile_id: p.id,
            team_id: team2Id,
            lineup_order: isPuttVsPutt ? team2Players.findIndex(player => player.id === p.id) + 1 : null,
            role: 'player'
          }));

          const { error: pError } = await supabase
            .from('match_players')
            .insert([...t1PlayersData, ...t2PlayersData]);
          if (pError) throw pError;
      } else if (selectedSport === 'cricket' && cricketVariant === 'backyard') {
        // Backyard Cricket - NO TEAMS, just players
        const playersData = individualPlayers.map((p, idx) => ({
          id: generateUUID(),
          match_id: matchId,
          profile_id: p.id,
          team_id: null,
          batting_order: idx + 1,
          role: 'player'
        }));

        const { error: pError } = await supabase
          .from('match_players')
          .insert(playersData);
        if (pError) throw pError;
      } else {
        // Other Individual format (Golf, Darts, etc.)
        const playersData = individualPlayers.map((p, idx) => ({
          id: generateUUID(),
          match_id: matchId,
          profile_id: p.id,
          team_id: null,
          batting_order: idx + 1,
          role: 'player'
        }));

        const { error: pError } = await supabase
          .from('match_players')
          .insert(playersData);
        if (pError) throw pError;
      }

      // 4. Special Initialization for Cricket
      if (selectedSport === 'cricket') {
        const isBackyard = cricketVariant === 'backyard';
        
        const inningsData: any = {
          id: generateUUID(),
          match_id: matchId,
          innings_number: 1,
          total_runs: 0,
          wickets: 0,
          balls: 0,
          is_completed: false,
          extras_wide: 0,
          extras_noball: 0,
          extras_bye: 0,
          extras_legbye: 0
        };

        if (isBackyard) {
          // Backyard: Set starting lineup from individual players pool
          inningsData.current_batter1_id = individualPlayers[0]?.id || null;
          inningsData.current_bowler_id = individualPlayers[1]?.id || null;
        } else {
          // Classic: Set teams and starting lineup
          inningsData.batting_team_id = team1Id;
          inningsData.bowling_team_id = team2Id;
          inningsData.current_batter1_id = team1Players[0]?.id || null;
          inningsData.current_batter2_id = team1Players[1]?.id || null;
          inningsData.current_bowler_id = team2Players[0]?.id || null;
        }

        const { error: innError } = await supabase
          .from('cricket_innings')
          .insert(inningsData);
        if (innError) throw innError;
      }
  
      // 5. Navigate to the match room
      navigate(`/match/${roomCode}`);
      
    } catch (e: any) {
      console.error("Failed to create match:", e);
      setError(e.message || 'Failed to create match. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      {/* Header */}
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-3">
          <button
            onClick={handleNavigationBack}
            className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-charcoal-50">New Match</h1>
            <p className="text-charcoal-400 text-sm">
              {step === 'sport'
                ? 'Choose a sport'
                : step === 'cricket_variant'
                  ? 'Select Cricket Type'
                  : step === 'golf_variant'
                    ? 'Select Golf Mode'
                    : step === 'darts_variant'
                      ? 'Select Darts Mode'
                      : step === 'config'
                        ? 'Configure rules'
                        : 'Add players'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">

        {/* STEP 1: Sport Selection */}
        {step === 'sport' && (
          <div className="space-y-3">
            {SPORTS.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSport(s.id);
                  if (s.id === 'cricket') {
                    setDartsVariant(null);
                    setStep('cricket_variant');
                  } else if (s.id === 'golf') {
                    setDartsVariant(null);
                    setStep('golf_variant');
                  } else if (s.id === 'darts') {
                    setCricketVariant(null);
                    setGolfVariant(null);
                    setDartsVariant(null);
                    setTeam1Players(activeUser ? [activeUser] : []);
                    setTeam2Players([]);
                    setIndividualPlayers(activeUser ? [activeUser] : []);
                    setStep('darts_variant');
                  } else {
                    setCricketVariant(null);
                    setGolfVariant(null);
                    setDartsVariant(null);
                    setTeam1Players(activeUser ? [activeUser] : []);
                    setTeam2Players([]);
                    setIndividualPlayers(activeUser ? [activeUser] : []);
                    setStep('config');
                  }
                }}
                className="w-full card p-4 flex items-center gap-4 text-left hover:border-accent-600/50 active:scale-[0.98] transition-all duration-150"
              >
                <div className="w-12 h-12 rounded-xl bg-charcoal-700 flex items-center justify-center text-2xl flex-shrink-0">
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-charcoal-100">{s.label}</p>
                  <p className="text-charcoal-400 text-sm truncate">{s.desc}</p>
                </div>
                <ChevronRight size={16} className="text-charcoal-500" />
              </button>
            ))}
          </div>
        )}
{/* STEP 1.5: Cricket Branch Option */}
{step === 'cricket_variant' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-charcoal-400 uppercase tracking-wider">Select Cricket Format</h2>
            
            <button
              onClick={() => {
                setCricketVariant('classic');
                setTeam1Players(activeUser ? [activeUser] : []);
                setTeam2Players([]);
                setStep('config');
              }}
              className="w-full card p-5 flex items-center gap-4 text-left hover:border-accent-500/50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-accent-950/40 border border-accent-800 flex items-center justify-center text-2xl text-accent-400">
                <Users size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-charcoal-50 text-base">Classic Match</h3>
                <p className="text-charcoal-400 text-sm mt-0.5">Two traditional competing teams. Draft or assign members to Team 1 and Team 2.</p>
              </div>
              <ChevronRight size={18} className="text-charcoal-500" />
            </button>

            {/* Backyard Button */}
            <button
              onClick={() => {
                setCricketVariant('backyard');
                setIndividualPlayers(activeUser ? [activeUser] : []);
                setStep('config');
              }}
              className="w-full card p-5 flex items-center gap-4 text-left hover:border-emerald-500/50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-800 flex items-center justify-center text-2xl text-emerald-400">
                <User size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-charcoal-50 text-base">Backyard Mode</h3>
                <p className="text-charcoal-400 text-sm mt-0.5">Every player for themselves! Track standalone batting runs and bowling figures.</p>
              </div>
              <ChevronRight size={18} className="text-charcoal-500" />
          </button>
        </div>
      )}

      {/* STEP 1.6: Golf Branch Option */}
      {step === 'golf_variant' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-charcoal-400 uppercase tracking-wider">Select Golf Mode</h2>
          
          <button
            onClick={() => {
              setGolfVariant('classic');
              setIndividualPlayers(activeUser ? [activeUser] : []);
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-accent-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-950/40 border border-accent-800 flex items-center justify-center text-2xl text-accent-400">
              ⛳
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">Classic Golf</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">Traditional hole-by-hole scorecard with par tracking.</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>

          <button
            onClick={() => {
              setGolfVariant('chip_off');
              setIndividualPlayers(activeUser ? [activeUser] : []);
              setHouseRules({
                balls_per_turn: 3,
                total_rounds: 9,
                hazard_penalty: false
              });
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-emerald-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-800 flex items-center justify-center text-2xl text-emerald-400">
              🏌️
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">Chip Off Mini Game</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">Point-based target challenge. Winner moves the pin!</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>

          <button
            onClick={() => {
              setGolfVariant('putt_vs_putt');
              setTeam1Players(activeUser ? [activeUser] : []);
              setTeam2Players([]);
              setIndividualPlayers([]);
              setHouseRules({
                starting_balls_per_team: 5,
              });
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-warning-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-warning-950/30 border border-warning-800 flex items-center justify-center text-2xl text-warning-400">
              🕳️
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">PvP (Putt vs Putt)</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">Two teams alternate putts into a shared pool until every ball is gone.</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>
        </div>
      )}

      {/* STEP 1.7: Darts Branch Option */}
      {step === 'darts_variant' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-charcoal-400 uppercase tracking-wider">Select Darts Mode</h2>

          <button
            onClick={() => {
              setSelectedSport('darts');
              setDartsVariant('countdown');
              setTeam1Players(activeUser ? [activeUser] : []);
              setTeam2Players([]);
              setIndividualPlayers(activeUser ? [activeUser] : []);
              setHouseRules({
                variant: 'countdown',
                start_score: 501,
                double_out: true
              });
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-accent-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-950/40 border border-accent-800 flex items-center justify-center text-2xl text-accent-400">
              🎯
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">{DARTS_MODE_META.countdown.title}</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">{DARTS_MODE_META.countdown.description}</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>

          <button
            onClick={() => {
              setSelectedSport('darts');
              setDartsVariant('around_the_world');
              setTeam1Players(activeUser ? [activeUser] : []);
              setTeam2Players([]);
              setIndividualPlayers(activeUser ? [activeUser] : []);
              setHouseRules({
                variant: 'around_the_world',
                skip_ahead_via_multiples: false,
                ring_restriction: 'any_segment'
              });
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-warning-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-warning-950/30 border border-warning-800 flex items-center justify-center text-2xl text-warning-400">
              🌍
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">{DARTS_MODE_META.around_the_world.title}</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">{DARTS_MODE_META.around_the_world.description}</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>

          <button
            onClick={() => {
              setSelectedSport('darts');
              setDartsVariant('killer');
              setTeam1Players(activeUser ? [activeUser] : []);
              setTeam2Players([]);
              setIndividualPlayers(activeUser ? [activeUser] : []);
              setHouseRules({
                variant: 'killer',
                starting_lives: 3,
                killer_activation_ring: 'doubles_only'
              });
              setStep('config');
            }}
            className="w-full card p-5 flex items-center gap-4 text-left hover:border-danger-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-danger-950/30 border border-danger-800 flex items-center justify-center text-2xl text-danger-400">
              💀
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-50 text-base">{DARTS_MODE_META.killer.title}</h3>
              <p className="text-charcoal-400 text-sm mt-0.5">{DARTS_MODE_META.killer.description}</p>
            </div>
            <ChevronRight size={18} className="text-charcoal-500" />
          </button>
        </div>
      )}


        {/* STEP 2: Configuration */}
        {step === 'config' && sport && (
          <div className="space-y-4">
            <div className="card p-4 space-y-4">
              <h3 className="font-bold text-charcoal-100 flex items-center gap-2 border-b border-charcoal-700 pb-2 mb-2">
                <Settings size={18} className="text-accent-400" />
                Match Details
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Game Name</label>
                  <input 
                    type="text" 
                    value={customName} 
                    onChange={e => setCustomName(e.target.value)}
                    placeholder={selectedSport === 'cricket' ? 'e.g. Boxing Day Test' : 'e.g. Sunday Morning Round'}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Match Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={matchTime} 
                    onChange={e => setMatchTime(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="pt-2">
                  <RuleToggle 
                    label="Practice Mode" 
                    explanation="Practice matches are excluded from Global Leaderboards and Season Points."
                    value={isPractice} 
                    onChange={setIsPractice} 
                  />
                  <p className="text-[10px] text-charcoal-500 mt-1 uppercase font-bold tracking-wider">Practice matches are excluded from Global Leaderboards & SP.</p>
                </div>
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <h3 className="font-bold text-charcoal-100 flex items-center gap-2">
                <span className="text-xl">{sport.icon}</span>
                {selectedSport === 'cricket'
                  ? `${sport.label} ${cricketVariant ? `(${cricketVariant === 'classic' ? 'Classic' : 'Backyard'}) ` : ''}Rules`
                  : selectedSport === 'darts' && dartsModeMeta
                    ? `${sport.label} (${dartsModeMeta.title}) Rules`
                    : `${sport.label} Rules`}
              </h3>
              
              {selectedSport === 'cricket' ? (
                <div className="space-y-3 pt-2">
                  <RuleToggle
                    label="No No-Balls rule"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'no_noballs')?.explain}
                    value={houseRules.no_noballs as boolean}
                    onChange={v => setHouseRules(prev => ({...prev, no_noballs: v}))}
                  />
                  <RuleToggle
                    label="No Wide rule"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'no_wides')?.explain}
                    value={houseRules.no_wides as boolean}
                    onChange={v => setHouseRules(prev => ({...prev, no_wides: v}))}
                  />
                  {cricketVariant !== 'backyard' && (
                    <>
                      <RuleNumber
                        label="Max overs"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'max_overs')?.explain}
                        value={houseRules.max_overs as number ?? 20}
                        onChange={v => setHouseRules(prev => ({...prev, max_overs: v}))}
                      />
                      <RuleNumber
                        label="Max wickets"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'max_wickets')?.explain}
                        value={houseRules.max_wickets as number ?? 10}
                        onChange={v => setHouseRules(prev => ({...prev, max_wickets: v}))}
                      />
                    </>
                  )}
                </div>
              ) : selectedSport === 'darts' && dartsVariant && dartsModeMeta ? (
                <div className="space-y-4 pt-2">
                  <div className="rounded-xl border border-charcoal-700 bg-charcoal-900/50 px-3 py-3">
                    <p className="text-sm leading-relaxed text-charcoal-400">{dartsModeMeta.summary}</p>
                  </div>

                  {dartsVariant === 'countdown' ? (
                    <div className="space-y-4">
                      <RuleLabel
                        label="Start Score"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'start_score')?.explain}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {[301, 501].map(score => (
                            <button
                              key={score}
                              onClick={() => setHouseRules(prev => ({ ...prev, start_score: score }))}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                                (houseRules.start_score as number ?? 501) === score ? 'bg-accent-600 text-charcoal-50' : 'bg-charcoal-700 text-charcoal-400'
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                      <RuleToggle
                        label="Enforce Double-Out"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'double_out')?.explain}
                        value={houseRules.double_out as boolean ?? true}
                        onChange={v => setHouseRules(prev => ({ ...prev, double_out: v }))}
                      />
                    </div>
                  ) : dartsVariant === 'around_the_world' ? (
                    <div className="space-y-4">
                      <RuleToggle
                        label="Skip Ahead via Multiples"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'skip_ahead_via_multiples')?.explain}
                        value={houseRules.skip_ahead_via_multiples as boolean ?? false}
                        onChange={v => setHouseRules(prev => ({ ...prev, skip_ahead_via_multiples: v }))}
                      />
                      <RuleSelect
                        label="Ring Restriction"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'ring_restriction')?.explain}
                        value={houseRules.ring_restriction as DartsRingRule ?? 'any_segment'}
                        options={[
                          { value: 'any_segment', label: 'Any Segment' },
                          { value: 'doubles_only', label: 'Doubles Only' },
                          { value: 'triples_only', label: 'Triples Only' },
                        ]}
                        onChange={v => setHouseRules(prev => ({ ...prev, ring_restriction: v }))}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <RuleNumber
                        label="Starting Lives"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'starting_lives')?.explain}
                        value={houseRules.starting_lives as number ?? 3}
                        min={1}
                        max={10}
                        onChange={v => setHouseRules(prev => ({ ...prev, starting_lives: v }))}
                      />
                      <RuleSelect
                        label="Target Ring to Become Killer"
                        explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'killer_activation_ring')?.explain}
                        value={houseRules.killer_activation_ring as DartsRingRule ?? 'doubles_only'}
                        options={[
                          { value: 'any_segment', label: 'Any Segment' },
                          { value: 'doubles_only', label: 'Doubles Only' },
                          { value: 'triples_only', label: 'Triples Only' },
                        ]}
                        onChange={v => setHouseRules(prev => ({ ...prev, killer_activation_ring: v }))}
                      />
                    </div>
                  )}
                </div>
              ) : selectedSport === 'golf' && golfVariant === 'classic' ? (
                <div className="space-y-4 pt-2">
                  <RuleLabel
                    label="Number of Holes"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'holes')?.explain}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {[9, 11, 18].map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            setGolfCourse(prev => {
                              if (prev.length === n) return prev;
                              if (prev.length > n) return prev.slice(0, n);
                              const extra = Array.from({ length: n - prev.length }, (_, i) => ({
                                number: prev.length + i + 1,
                                name: '',
                                par: 4
                              }));
                              return [...prev, ...extra];
                            });
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            golfCourse.length === n ? 'bg-accent-600 text-charcoal-50' : 'bg-charcoal-700 text-charcoal-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setGolfCourse(PIZZA_PUTT_COURSE)}
                      className="flex-1 py-2 bg-warning-950/30 border border-warning-800 text-warning-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                    >
                      🍕 Load Pizza Putt Template
                    </button>
                  </div>

                  <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {golfCourse.map((hole, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-charcoal-900/50 p-2 rounded-xl border border-charcoal-700">
                        <span className="w-6 text-xs font-mono text-charcoal-500">{hole.number}</span>
                        <input
                          type="text"
                          placeholder="Hole name (optional)"
                          value={hole.name}
                          onChange={e => {
                            const newCourse = [...golfCourse];
                            newCourse[idx].name = e.target.value;
                            setGolfCourse(newCourse);
                          }}
                          className="flex-1 bg-transparent border-none outline-none text-sm text-charcoal-100 placeholder:text-charcoal-600"
                        />
                        <div className="flex items-center gap-2 bg-charcoal-800 rounded-lg px-2 py-1 border border-charcoal-700">
                          <span className="text-[10px] uppercase text-charcoal-500 font-bold">Par</span>
                          <select
                            value={hole.par}
                            onChange={e => {
                              const newCourse = [...golfCourse];
                              newCourse[idx].par = Number(e.target.value);
                              setGolfCourse(newCourse);
                            }}
                            className="bg-transparent text-charcoal-200 text-sm border-none outline-none font-bold"
                          >
                            {[2, 3, 4, 5, 6].map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedSport === 'golf' && golfVariant === 'putt_vs_putt' ? (
                <div className="space-y-4 pt-2">
                  <div className="rounded-xl border border-charcoal-700 bg-charcoal-900/50 px-3 py-3">
                    <p className="text-sm leading-relaxed text-charcoal-400">
                      Two teams alternate putting. Each player takes one attempt per ball remaining at the start of their turn. Every holed putt scores a point and permanently removes one ball from the pool.
                    </p>
                  </div>
                  <RuleNumber
                    label="Starting Balls"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'starting_balls_per_team')?.explain}
                    value={houseRules.starting_balls_per_team as number ?? 5}
                    min={1}
                    max={10}
                    onChange={v => setHouseRules(prev => ({ ...prev, starting_balls_per_team: v }))}
                  />
                </div>
              ) : selectedSport === 'golf' && golfVariant === 'chip_off' ? (
                <div className="space-y-4 pt-2">
                  <RuleNumber
                    label="Balls Per Turn"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'balls_per_turn')?.explain}
                    value={houseRules.balls_per_turn as number ?? 3}
                    onChange={v => setHouseRules(prev => ({...prev, balls_per_turn: v}))}
                  />
                  <RuleNumber
                    label="Total Rounds"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'total_rounds')?.explain}
                    value={houseRules.total_rounds as number ?? 9}
                    onChange={v => setHouseRules(prev => ({...prev, total_rounds: v}))}
                  />
                  <RuleToggle
                    label="Hazard Penalty (-1)"
                    explanation={getRuleDefinition(selectedSport, effectiveHouseRules, 'hazard_penalty')?.explain}
                    value={houseRules.hazard_penalty as boolean}
                    onChange={v => setHouseRules(prev => ({...prev, hazard_penalty: v}))}
                  />
                </div>
              ) : (
                <p className="text-charcoal-400 text-sm">Playing with standard configuration rules.</p>
              )}
            </div>

            <button onClick={() => setStep('players')} className="btn-primary w-full flex items-center justify-center gap-2">
              Continue to Players <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* STEP 3: Players */}
        {step === 'players' && (
          <div className="space-y-4">
            {isTeam ? (
              <>
                <TeamPlayerPicker teamName={team1Name} onTeamNameChange={setTeam1Name} teamColor="#3b82f6" players={team1Players} onRemove={(id) => removePlayerFromGroup(id, 'team1')} onAdd={() => setActiveTeamPicker('team1')} />
                <TeamPlayerPicker teamName={team2Name} onTeamNameChange={setTeam2Name} teamColor="#ef4444" players={team2Players} onRemove={(id) => removePlayerFromGroup(id, 'team2')} onAdd={() => setActiveTeamPicker('team2')} />
                {isPuttVsPutt && (
                  <>
                    <LineupOrderBuilder
                      title={`${team1Name} Lineup Order`}
                      players={team1Players}
                      onChange={setTeam1Players}
                      accentColor="#3b82f6"
                    />
                    <LineupOrderBuilder
                      title={`${team2Name} Lineup Order`}
                      players={team2Players}
                      onChange={setTeam2Players}
                      accentColor="#ef4444"
                    />
                  </>
                )}
              </>
            ) : (
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-charcoal-100 flex items-center gap-2">
                    <User size={16} className="text-accent-400" />
                    Player Pool ({individualPlayers.length})
                  </h3>
                  <button onClick={() => setActiveTeamPicker('individual')} className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1">
                    <Plus size={14} /> Add Player
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {individualPlayers.map(p => (
                    <PlayerChip key={p.id} profile={p} locked={p.id === activeUser?.id} onRemove={() => removePlayerFromGroup(p.id, 'individual')} />
                  ))}
                </div>
              </div>
            )}

            {activeTeamPicker && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
                <div className="w-full bg-charcoal-800 rounded-t-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-charcoal-100">Add Player</h3>
                    <button onClick={() => setActiveTeamPicker(null)} className="p-1.5 text-charcoal-400"><X size={20} /></button>
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
                    <input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} className="input-field pl-9" placeholder="Search..." autoFocus />
                  </div>
                  <div className="space-y-1">
                    {filteredProfiles.filter(p => !allSelectedIds.has(p.id)).map(p => (
                      <button key={p.id} onClick={() => addPlayerToGroup(p, activeTeamPicker!)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-charcoal-700 text-left">
                        <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
                        <span className="text-charcoal-100 font-medium text-sm">{p.display_name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="divider pt-2">
                    <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} className="input-field" placeholder="Guest name" />
                    <button onClick={handleAddGuest} disabled={!guestName.trim()} className="btn-secondary mt-2 w-full py-2">Add Guest</button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-danger-900/30 border border-danger-600/50 rounded-xl p-4 flex items-start gap-3 mb-4">
                <AlertCircle className="text-danger-400 flex-shrink-0" size={18} />
                <p className="text-danger-200 text-sm">{error}</p>
              </div>
            )}

            <button onClick={handleCreateMatch} className="btn-success w-full flex items-center justify-center gap-2 text-lg py-4">
              <Check size={20} /> Start Match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamPlayerPicker({
  teamName,
  onTeamNameChange,
  teamColor,
  players,
  onRemove,
  onAdd,
}: {
  teamName: string;
  onTeamNameChange: (value: string) => void;
  teamColor: string;
  players: Profile[];
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: teamColor }} />
        <input type="text" value={teamName} onChange={e => onTeamNameChange(e.target.value)} className="bg-transparent text-charcoal-100 font-bold focus:outline-none" />
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((p) => <PlayerChip key={p.id} profile={p} onRemove={() => onRemove(p.id)} />)}
        <button onClick={onAdd} className="px-3 py-1.5 rounded-full border border-dashed border-charcoal-600 text-charcoal-400 text-sm font-medium hover:text-accent-400 transition-colors"><Plus size={12} className="inline mr-1"/>Add</button>
      </div>
    </div>
  );
}

function PlayerChip({
  profile,
  onRemove,
  locked,
}: {
  profile: Profile;
  onRemove: () => void;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-charcoal-700 rounded-full pl-1 pr-2 py-1 border border-charcoal-600">
      <Avatar name={profile.display_name} color={profile.avatar_color} size="xs" />
      <span className="text-charcoal-100 text-sm">{profile.display_name}</span>
      {!locked && <button onClick={onRemove} className="text-charcoal-500 hover:text-danger-400"><X size={12} /></button>}
    </div>
  );
}

function RuleLabel({ label, explanation }: { label: string; explanation?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-charcoal-200 text-sm">{label}</span>
      {explanation && <InfoTooltip content={explanation} label={`More information about ${label}`} />}
    </div>
  );
}

function RuleToggle({
  label,
  explanation,
  value,
  onChange,
}: {
  label: string;
  explanation?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <RuleLabel label={label} explanation={explanation} />
      <button onClick={() => onChange(!value)} className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-accent-600' : 'bg-charcoal-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${value ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function RuleSelect<T extends string>({
  label,
  explanation,
  value,
  options,
  onChange,
}: {
  label: string;
  explanation?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <RuleLabel label={label} explanation={explanation} />
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="min-w-[10rem] rounded-lg border border-charcoal-600 bg-charcoal-800 px-3 py-2 text-right text-sm text-charcoal-100 outline-none"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RuleNumber({
  label,
  explanation,
  value,
  onChange,
  min = 1,
  max,
}: {
  label: string;
  explanation?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const decrementValue = Math.max(min, value - 1);
  const incrementValue = max !== undefined ? Math.min(max, value + 1) : value + 1;

  return (
    <div className="flex items-center justify-between">
      <RuleLabel label={label} explanation={explanation} />
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(decrementValue)} className="w-8 h-8 rounded-lg bg-charcoal-700 border border-charcoal-600 text-charcoal-200 font-bold">-</button>
        <span className="w-8 text-center text-charcoal-100 font-mono font-semibold">{value}</span>
        <button onClick={() => onChange(incrementValue)} className="w-8 h-8 rounded-lg bg-charcoal-700 border border-charcoal-600 text-charcoal-200 font-bold">+</button>
      </div>
    </div>
  );
}
