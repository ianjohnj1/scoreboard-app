import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Users, User, Plus, X,
  Check, Search, Settings, AlertCircle
} from 'lucide-react';
import { getAllProfiles } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import type { Profile, MatchRoom, MatchTeam, MatchPlayer } from '../lib/supabase';

const SPORTS = [
  { id: 'cricket', label: 'Cricket', icon: '🏏', team: true, desc: 'Traditional or backyard match types' },
  { id: 'golf', label: 'Golf', icon: '⛳', team: false, desc: '9 or 18-hole scorecard with par tracking' },
  { id: 'darts', label: 'Darts (501)', icon: '🎯', team: false, desc: 'Countdown scoring with checkouts' },
  { id: 'table_tennis', label: 'Table Tennis', icon: '🏓', team: true, desc: 'Win-by-2 game tracking' },
  { id: 'pool', label: '8-Ball Pool', icon: '🎱', team: true, desc: 'Frame tracking & golden breaks' },
  { id: 'basketball', label: 'Basketball', icon: '🏀', team: true, desc: '1/2/3 point tracking with players' },
  { id: 'cards', label: 'Card Games', icon: '🃏', team: false, desc: 'End-of-round grid scoring' },
  { id: 'custom', label: 'Custom Sport', icon: '🎮', team: null, desc: 'Build your own scoring interface' },
];

// Added a dedicated 'cricket_variant' sub-step
type Step = 'sport' | 'cricket_variant' | 'config' | 'players';

export default function NewMatchPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [step, setStep] = useState<Step>('sport');
  const [selectedSport, setSelectedSport] = useState('');
  const [cricketVariant, setCricketVariant] = useState<'classic' | 'backyard' | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Custom config
  const [customName, setCustomName] = useState('');
  const [customIsTeam, setCustomIsTeam] = useState(false);
  const [customWinCondition, setCustomWinCondition] = useState<'highest' | 'lowest'>('highest');
  const [customButtons, setCustomButtons] = useState([
    { label: '+1 Point', value: 1 },
    { label: '+5 Points', value: 5 },
  ]);

  // House rules
  const [houseRules, setHouseRules] = useState<Record<string, unknown>>({});

  // Teams/Players
  const [team1Name, setTeam1Name] = useState('Team 1');
  const [team2Name, setTeam2Name] = useState('Team 2');
  const [team1Players, setTeam1Players] = useState<Profile[]>([]);
  const [team2Players, setTeam2Players] = useState<Profile[]>([]);
  const [individualPlayers, setIndividualPlayers] = useState<Profile[]>([]);

  const [playerSearch, setPlayerSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [activeTeamPicker, setActiveTeamPicker] = useState<'team1' | 'team2' | 'individual' | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeUser = currentUser;

  useEffect(() => {
    getAllProfiles()
      .then(setProfiles)
      .catch((err) => {
        console.error("Failed to fetch profiles:", err);
      });
    
    if (activeUser) {
      setIndividualPlayers([activeUser]);
      setTeam1Players([activeUser]);
    }
  }, [currentUser]);
  useEffect(() => {
    if (cricketVariant === 'backyard') {
      setHouseRules({
        no_noballs: false,
        no_wides: false,
        max_overs: 20,
        max_wickets: 10
      });
    }
  }, [cricketVariant]);
  const sport = SPORTS.find(s => s.id === selectedSport);
  
  // Backyard mode forces an individual format setup
  const isTeam = selectedSport === 'custom' 
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
      // Generate a unique username for the guest
      const guestUsername = `guest_${Date.now()}`;
      
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
        .select()
        .single();

      if (error) throw error;

      if (newGuest) {
        setProfiles(prev => [...prev, newGuest]);
        if (activeTeamPicker) addPlayerToGroup(newGuest, activeTeamPicker);
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
    else if (step === 'config') {
      setStep(selectedSport === 'cricket' ? 'cricket_variant' : 'sport');
    } else if (step === 'players') setStep('config');
  };

  const handleCreateMatch = async () => {
    if (isTeam ? (team1Players.length < 1 || team2Players.length < 1) : individualPlayers.length < 1) return;
    setLoading(true);
    setError('');
  
    try {
      // 1. Generate IDs and Room Code
      const matchId = crypto.randomUUID();
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();

      // 2. Insert the match record
      const { error: matchError } = await supabase
        .from('match_rooms')
        .insert({
          id: matchId,
          room_code: roomCode,
          sport: selectedSport,
          custom_game_name: selectedSport === 'custom' ? customName : null,
          status: 'active',
          created_by: currentUser?.id || null,
          house_rules: {
            ...houseRules,
            variant: cricketVariant
          },
          custom_config: selectedSport === 'custom' ? {
            is_team: customIsTeam,
            win_condition: customWinCondition,
            buttons: customButtons
          } : {
            cricket_variant: cricketVariant
          }
        });
  
      if (matchError) throw matchError;

      // 3. Setup Teams and Players
      let team1Id: string | null = null;
      let team2Id: string | null = null;

      if (isTeam || (selectedSport === 'cricket' && cricketVariant === 'classic')) {
        team1Id = crypto.randomUUID();
        team2Id = crypto.randomUUID();

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
            match_id: matchId,
            profile_id: p.id,
            team_id: team1Id,
            role: 'player'
          }));

          // Add Team 2 Players
          const t2PlayersData = team2Players.map(p => ({
            match_id: matchId,
            profile_id: p.id,
            team_id: team2Id,
            role: 'player'
          }));

          const { error: pError } = await supabase
            .from('match_players')
            .insert([...t1PlayersData, ...t2PlayersData]);
          if (pError) throw pError;
      } else if (selectedSport === 'cricket' && cricketVariant === 'backyard') {
        // Backyard Cricket - NO TEAMS, just players
        const playersData = individualPlayers.map((p, idx) => ({
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
          match_id: matchId,
          innings_number: 1,
          total_runs: 0,
          wickets: 0,
          balls: 0,
          is_completed: false
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
      
    } catch (e) {
      console.error("Failed to create match:", e);
      setError('Failed to create match. Please try again.');
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
              {step === 'sport' ? 'Choose a sport' : step === 'cricket_variant' ? 'Select Cricket Type' : step === 'config' ? 'Configure rules' : 'Add players'}
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
                    setStep('cricket_variant');
                  } else {
                    setCricketVariant(null);
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


        {/* STEP 2: Configuration */}
        {step === 'config' && sport && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <h3 className="font-bold text-charcoal-100 flex items-center gap-2">
                <span className="text-xl">{sport.icon}</span>
                {sport.label} {cricketVariant && `(${cricketVariant === 'classic' ? 'Classic' : 'Backyard'})`} Rules
              </h3>
              
              {selectedSport === 'cricket' ? (
                <div className="space-y-3 pt-2">
                  <RuleToggle label="No No-Balls rule" value={houseRules.no_noballs as boolean} onChange={v => setHouseRules(prev => ({...prev, no_noballs: v}))} />
                  <RuleToggle label="No Wide rule" value={houseRules.no_wides as boolean} onChange={v => setHouseRules(prev => ({...prev, no_wides: v}))} />
                  <RuleNumber label="Max overs" value={houseRules.max_overs as number ?? 20} onChange={v => setHouseRules(prev => ({...prev, max_overs: v}))} />
                  <RuleNumber label="Max wickets" value={houseRules.max_wickets as number ?? 10} onChange={v => setHouseRules(prev => ({...prev, max_wickets: v}))} />
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

function TeamPlayerPicker({ teamName, onTeamNameChange, teamColor, players, onRemove, onAdd }: any) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: teamColor }} />
        <input type="text" value={teamName} onChange={e => onTeamNameChange(e.target.value)} className="bg-transparent text-charcoal-100 font-bold focus:outline-none" />
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((p: any) => <PlayerChip key={p.id} profile={p} onRemove={() => onRemove(p.id)} />)}
        <button onClick={onAdd} className="px-3 py-1.5 rounded-full border border-dashed border-charcoal-600 text-charcoal-400 text-sm font-medium hover:text-accent-400 transition-colors"><Plus size={12} className="inline mr-1"/>Add</button>
      </div>
    </div>
  );
}

function PlayerChip({ profile, onRemove, locked }: any) {
  return (
    <div className="flex items-center gap-1.5 bg-charcoal-700 rounded-full pl-1 pr-2 py-1 border border-charcoal-600">
      <Avatar name={profile.display_name} color={profile.avatar_color} size="xs" />
      <span className="text-charcoal-100 text-sm">{profile.display_name}</span>
      {!locked && <button onClick={onRemove} className="text-charcoal-500 hover:text-danger-400"><X size={12} /></button>}
    </div>
  );
}

function RuleToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-charcoal-200 text-sm">{label}</span>
      <button onClick={() => onChange(!value)} className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-accent-600' : 'bg-charcoal-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${value ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function RuleNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-charcoal-200 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, value - 1))} className="w-8 h-8 rounded-lg bg-charcoal-700 border border-charcoal-600 text-charcoal-200 font-bold">-</button>
        <span className="w-8 text-center text-charcoal-100 font-mono font-semibold">{value}</span>
        <button onClick={() => onChange(value + 1)} className="w-8 h-8 rounded-lg bg-charcoal-700 border border-charcoal-600 text-charcoal-200 font-bold">+</button>
      </div>
    </div>
  );
}