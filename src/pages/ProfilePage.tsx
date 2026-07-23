import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LogOut, Settings, Star, BarChart2, Users,
  Link as LinkIcon, Shield, Edit3, Check, ArrowLeft, ArrowRightLeft, Info, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { linkGuestAccount, getAllProfiles } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/UserAvatar';
import Modal from '../components/Modal';
import ThemeToggle from '../components/ThemeToggle';
import type { Profile, PlayerCareerAnalytics } from '../lib/supabase';
import { SAFE_PROFILE_COLUMNS } from '../lib/supabase';

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin: isCurrentUserAdmin, syncCurrentUser } = useAuth();
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<PlayerCareerAnalytics[]>([]);
  const [tab, setTab] = useState<'individual' | 'team'>('individual');
  const [isPracticeFilter, setIsPracticeFilter] = useState(false);
  const [guestProfiles, setGuestProfiles] = useState<Profile[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Profile | null>(null);
  const [linkForm, setLinkForm] = useState({ displayName: '', username: '', pin: '' });
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ displayName: '', catchphrase: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [currentUserStats, setCurrentUserStats] = useState<PlayerCareerAnalytics[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const isOwnProfile = !id || id === currentUser?.id;

  useEffect(() => {
    const loadProfile = async () => {
      if (!id) {
        setTargetProfile(currentUser);
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select(SAFE_PROFILE_COLUMNS)
        .eq('id', id)
        .single();

      if (!error && data) {
        setTargetProfile({ ...data, pin_hash: null });
      }
    };
    loadProfile();
  }, [id, currentUser]);

  const loadStats = useCallback(async (isMounted?: () => boolean) => {
    const profileId = id || currentUser?.id;
    if (!profileId) return;

    const { data, error } = await supabase
      .from('player_career_analytics')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_practice', isPracticeFilter);
    
    if (isMounted && !isMounted()) return;

    if (error) {
      console.error("Error loading profile stats:", error);
      return;
    }
    setStats(data || []);
  }, [id, currentUser, isPracticeFilter]);

  useEffect(() => {
    if (targetProfile && isOwnProfile) {
      setSettingsForm({
        displayName: targetProfile.display_name,
        catchphrase: targetProfile.catchphrase || ''
      });
    }
  }, [targetProfile, isOwnProfile]);

  const handleUpdateSettings = async () => {
    if (!currentUser || !isOwnProfile) return;
    try {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({
          display_name: settingsForm.displayName,
          catchphrase: settingsForm.catchphrase,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUser.id)
        .select(SAFE_PROFILE_COLUMNS)
        .single();

      if (error) throw error;
      if (updatedProfile) {
        const safeProfile = { ...updatedProfile, pin_hash: null };
        syncCurrentUser(safeProfile);
        setTargetProfile(safeProfile);
      }
      setShowSettingsModal(false);
    } catch (err) {
      console.error("Error updating profile:", err);
      alert("Failed to update profile.");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !isOwnProfile) return;

    setUploadingAvatar(true);
    try {
      // Intelligently determine the file extension
      let fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      
      // If the extension is missing or not a standard web image, try to derive from MIME type
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'];
      if (!allowedExtensions.includes(fileExt)) {
        if (file.type === 'image/jpeg') fileExt = 'jpeg';
        else if (file.type === 'image/png') fileExt = 'png';
        else if (file.type === 'image/webp') fileExt = 'webp';
        else if (file.type === 'image/gif') fileExt = 'gif';
        else if (file.type === 'image/heic') fileExt = 'heic';
        else if (file.type === 'image/heif') fileExt = 'heif';
        else fileExt = 'jpeg'; // Safe fallback
      }

      const fileName = `${currentUser.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser.id)
        .select(SAFE_PROFILE_COLUMNS)
        .single();

      if (updateError) throw updateError;
      if (updatedProfile) {
        const safeProfile = { ...updatedProfile, pin_hash: null };
        syncCurrentUser(safeProfile);
        setTargetProfile(safeProfile);
      }
    } catch (err: any) {
      console.error("Error uploading avatar:", err);
      alert(`Failed to upload avatar: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadStats(() => mounted);

    if (isOwnProfile && currentUser && isCurrentUserAdmin) {
      getAllProfiles().then(profiles => {
        if (!mounted) return;
        setGuestProfiles(profiles.filter(p => p.is_guest && !p.linked_profile_id));
      });
    }
    return () => { mounted = false; };
  }, [id, currentUser, isCurrentUserAdmin, isOwnProfile, loadStats]);

  useEffect(() => {
    const profileId = id || currentUser?.id;
    if (!profileId) return;

    const channel = supabase
      .channel(`profile-stats-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_career_stats',
          filter: `profile_id=eq.${profileId}`
        },
        () => {
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, currentUser]);

  useEffect(() => {
    if (refreshKey > 0) {
      loadStats();
    }
  }, [refreshKey, loadStats]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleLinkGuest = async () => {
    if (!linkTarget || !isOwnProfile) return;
    setLinkLoading(true);
    setLinkError('');
    try {
      await linkGuestAccount(linkTarget.id, linkForm.displayName, linkForm.username, linkForm.pin);
      setShowLinkModal(false);
      setGuestProfiles(prev => prev.filter(p => p.id !== linkTarget.id));
    } catch {
      setLinkError('Failed to link account. Username may be taken.');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!currentUser) return;
    setCompareLoading(true);
    try {
      const { data, error } = await supabase
        .from('player_career_analytics')
        .select('*')
        .eq('profile_id', currentUser.id)
        .eq('is_practice', isPracticeFilter);
      
      if (!error && data) {
        setCurrentUserStats(data);
        setShowCompareModal(true);
      }
    } finally {
      setCompareLoading(false);
    }
  };

  if (!targetProfile) return null;

  const totalWins = stats.reduce((s, x) => s + x.matches_won, 0);
  const totalPlayed = stats.reduce((s, x) => s + x.matches_played, 0);
  const winPct = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-6 safe-top">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {!isOwnProfile && (
              <button 
                onClick={() => navigate(-1)}
                className="p-2 rounded-xl bg-charcoal-700 text-charcoal-300 hover:text-charcoal-50 transition-colors mr-2"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <UserAvatar
              display_name={targetProfile.display_name}
              avatar_color={targetProfile.avatar_color}
              avatar_url={targetProfile.avatar_url}
              size="xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h1 className="text-xl font-bold text-charcoal-50 truncate">{targetProfile.display_name}</h1>
                {targetProfile.is_admin && <span className="pill-admin">Admin</span>}
              </div>
              {targetProfile.username && (
                <p className="text-charcoal-400 text-sm truncate">@{targetProfile.username}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-charcoal-500">
                <span>{totalWins}W / {totalPlayed} games</span>
                <span>•</span>
                <span>{winPct}% win rate</span>
              </div>
            </div>
          </div>
          {isOwnProfile ? (
            <div className="flex w-full flex-wrap gap-2 items-center sm:w-auto sm:justify-end">
              <ThemeToggle />
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-400 transition-colors"
                aria-label="Open settings"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-charcoal-700/70 hover:bg-charcoal-700 text-charcoal-200 transition-colors ml-auto sm:ml-0 sm:px-2 sm:bg-transparent sm:text-charcoal-400"
                aria-label="Log out"
              >
                <LogOut size={20} />
                <span className="text-sm font-semibold sm:hidden">Log Out</span>
              </button>
            </div>
          ) : currentUser && (
            <button
              onClick={handleCompare}
              disabled={compareLoading}
              className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 text-charcoal-50 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-accent-900/20 active:scale-95"
            >
              {compareLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRightLeft size={18} />
              )}
              Compare
            </button>
          )}
        </div>
      </div>

      {targetProfile.catchphrase && (
        <div className="bg-accent-600/10 py-2 overflow-hidden relative border-y border-accent-500/20">
          <div className="flex whitespace-nowrap animate-marquee font-black uppercase tracking-widest text-accent-500 text-[10px] italic">
            <span className="px-8">{targetProfile.catchphrase}</span>
            <span className="px-8">{targetProfile.catchphrase}</span>
            <span className="px-8">{targetProfile.catchphrase}</span>
            <span className="px-8">{targetProfile.catchphrase}</span>
          </div>
        </div>
      )}

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Stats tabs */}
        <div className="flex bg-charcoal-800 rounded-xl p-1 border border-charcoal-700">
          {[{v:false,l:'Competitive'},{v:true,l:'Practice'}].map(t => (
            <button
              key={t.l}
              onClick={() => setIsPracticeFilter(t.v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                isPracticeFilter === t.v ? 'bg-accent-600 text-charcoal-50' : 'text-charcoal-400'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="flex bg-charcoal-800 rounded-xl p-1 border border-charcoal-700">
          {[{v:'individual',l:'Individual Stats'},{v:'team',l:'Team Stats'}].map(t => (
            <button
              key={t.v}
              onClick={() => setTab(t.v as typeof tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.v ? 'bg-accent-600 text-charcoal-50' : 'text-charcoal-400'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {/* Stats grid */}
        {stats.length === 0 ? (
          <div className="card p-6 text-center">
            <BarChart2 size={28} className="text-charcoal-600 mx-auto mb-2" />
            <p className="text-charcoal-400 text-sm">No stats yet. Play some matches!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stats.map(s => (
                <div key={`${s.profile_id}-${s.sport}-${s.is_practice}`} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-charcoal-100 capitalize">{s.sport.replace('_', ' ')}</h3>
                    <div className="flex items-center gap-1 text-warning-400">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-semibold">{s.matches_won}W</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Played', value: s.matches_played },
                      { label: 'Won', value: s.matches_won },
                      { label: 'Lost', value: s.matches_lost },
                    ].map(st => (
                      <div key={st.label} className="stat-card">
                        <p className="text-charcoal-500 text-xs">{st.label}</p>
                        <p className="text-charcoal-100 font-bold font-mono text-lg">{st.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Advanced Analytics */}
                  {s.sport === 'cricket' && (
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-accent-950/20 border-accent-900/30">
                          <p className="text-accent-500 text-[10px] uppercase font-bold">Strike Rate</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.strike_rate.toFixed(1)}</p>
                        </div>
                        <div className="stat-card bg-accent-950/20 border-accent-900/30">
                          <p className="text-accent-500 text-[10px] uppercase font-bold">Dot %</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.dot_ball_percentage.toFixed(1)}%</p>
                        </div>
                        <div className="stat-card bg-accent-950/20 border-accent-900/30">
                          <p className="text-accent-500 text-[10px] uppercase font-bold">Boundary %</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.boundary_percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-success-950/20 border-success-900/30">
                          <p className="text-success-500 text-[10px] uppercase font-bold">Economy</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.economy_rate.toFixed(2)}</p>
                        </div>
                        <div className="stat-card bg-success-950/20 border-success-900/30">
                          <p className="text-success-500 text-[10px] uppercase font-bold">Bowl SR</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.bowling_strike_rate > 0 ? s.bowling_strike_rate.toFixed(1) : '-'}</p>
                        </div>
                        <div className="stat-card bg-success-950/20 border-success-900/30">
                          <p className="text-success-500 text-[10px] uppercase font-bold">Bowl Dots</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.total_cricket_dots_bowled}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {s.sport === 'chip_off' && (
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-emerald-950/20 border-emerald-900/30">
                          <p className="text-emerald-500 text-[10px] uppercase font-bold">Efficiency</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.scoring_efficiency.toFixed(1)}%</p>
                        </div>
                        <div className="stat-card bg-emerald-950/20 border-emerald-900/30">
                          <p className="text-emerald-500 text-[10px] uppercase font-bold">Ace Freq</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.ace_frequency.toFixed(1)}%</p>
                        </div>
                        <div className="stat-card bg-emerald-950/20 border-emerald-900/30">
                          <p className="text-emerald-500 text-[10px] uppercase font-bold">Hazard Avoid</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.hazard_avoidance_rating.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-emerald-950/20 border-emerald-900/30">
                          <p className="text-emerald-500 text-[10px] uppercase font-bold">Avg Prox</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.average_proximity_tier.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {s.sport === 'putt_vs_putt' && (
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="stat-card bg-warning-950/20 border-warning-900/30">
                          <p className="text-warning-500 text-[10px] uppercase font-bold">Career % Holed</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.career_pct_holed.toFixed(1)}%</p>
                        </div>
                        <div className="stat-card bg-warning-950/20 border-warning-900/30">
                          <p className="text-warning-500 text-[10px] uppercase font-bold">Career Holes</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.holed_putts_total}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="stat-card bg-warning-950/20 border-warning-900/30">
                          <p className="text-warning-500 text-[10px] uppercase font-bold">Clutch Putts</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.clutch_putts}</p>
                        </div>
                        <div className="stat-card bg-warning-950/20 border-warning-900/30">
                          <p className="text-warning-500 text-[10px] uppercase font-bold">Total Attempts</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.total_putt_attempts}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {s.sport === 'darts' && (
                    <div className="space-y-2 mt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">3-Dart Avg</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.countdown_ppr > 0 ? s.countdown_ppr.toFixed(1) : '-'}</p>
                        </div>
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">First 9 Avg</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.first_nine_ppr > 0 ? s.first_nine_ppr.toFixed(1) : '-'}</p>
                        </div>
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">Checkout %</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.checkout_pct > 0 ? `${s.checkout_pct.toFixed(1)}%` : '0.0%'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">ATW Efficiency</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.atw_efficiency > 0 ? s.atw_efficiency.toFixed(1) : '-'}</p>
                        </div>
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">Lethality %</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.killer_lethality > 0 ? `${s.killer_lethality.toFixed(1)}%` : '0.0%'}</p>
                        </div>
                        <div className="stat-card bg-indigo-950/20 border-indigo-900/30">
                          <p className="text-indigo-500 text-[10px] uppercase font-bold">Avg Survival</p>
                          <p className="text-charcoal-100 font-bold font-mono">{s.killer_survival > 0 ? s.killer_survival.toFixed(1) : '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            ))}
          </div>
        )}

        {isOwnProfile && (
          <Link
            to="/about"
            className="card p-4 flex items-center justify-between gap-4 hover:border-charcoal-600 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-charcoal-800 border border-charcoal-700 flex items-center justify-center flex-shrink-0">
                <Info size={18} className="text-charcoal-300" />
              </div>
              <div className="min-w-0">
                <p className="text-charcoal-100 font-semibold">About The App</p>
                <p className="text-charcoal-400 text-sm truncate">
                  Learn what the app does, how it works, and what makes it unique.
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-charcoal-500 group-hover:text-charcoal-300 flex-shrink-0" />
          </Link>
        )}

        {/* Admin Panel */}
        {isOwnProfile && isCurrentUserAdmin && (
          <div className="card overflow-hidden">
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className="w-full flex items-center justify-between p-4 hover:bg-charcoal-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-danger-400" />
                <span className="font-semibold text-charcoal-100">Admin Panel</span>
                <span className="pill-admin text-xs">Admin</span>
              </div>
              <span className="text-charcoal-500">{showAdminPanel ? '▲' : '▼'}</span>
            </button>

            {showAdminPanel && (
              <div className="border-t border-charcoal-700 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-300 mb-2 flex items-center gap-2">
                    <Users size={14} />
                    Link Guest Accounts ({guestProfiles.length})
                  </h3>
                  {guestProfiles.length === 0 ? (
                    <p className="text-charcoal-500 text-sm">No pending guest accounts</p>
                  ) : (
                    <div className="space-y-2">
                      {guestProfiles.map(guest => (
                        <div key={guest.id} className="flex items-center gap-3 p-2 rounded-lg bg-charcoal-700/50">
                          <UserAvatar
                            display_name={guest.display_name}
                            avatar_color={guest.avatar_color}
                            avatar_url={guest.avatar_url}
                            size="sm"
                          />
                          <span className="text-charcoal-200 text-sm flex-1">{guest.display_name}</span>
                          <button
                            onClick={() => {
                              setLinkTarget(guest);
                              setLinkForm({ displayName: guest.display_name, username: '', pin: '' });
                              setShowLinkModal(true);
                            }}
                            className="btn-secondary py-1 px-3 text-xs flex items-center gap-1"
                          >
                            <LinkIcon size={12} /> Link Account
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isOwnProfile && (
        <>
          <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Profile Settings">
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <UserAvatar
                    display_name={targetProfile.display_name}
                    avatar_color={targetProfile.avatar_color}
                    avatar_url={targetProfile.avatar_url}
                    size="xl"
                  />
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Edit3 size={24} className="text-charcoal-50" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                  </label>
                  {uploadingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] uppercase font-bold text-charcoal-500 tracking-widest">Tap to change avatar</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={settingsForm.displayName}
                    onChange={e => setSettingsForm(s => ({ ...s, displayName: e.target.value }))}
                    className="input-field"
                    placeholder="Your Name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
                    Catchphrase / Trash Talk
                  </label>
                  <input
                    type="text"
                    value={settingsForm.catchphrase}
                    onChange={e => setSettingsForm(s => ({ ...s, catchphrase: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. Can't touch this! 🏏"
                  />
                  <p className="text-[10px] text-charcoal-500 mt-1">This will scroll across your profile banner.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowSettingsModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleUpdateSettings} className="btn-primary flex-1">Save Changes</button>
              </div>
            </div>
          </Modal>

          <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Link Guest Account">
            <div className="space-y-4">
              <p className="text-charcoal-400 text-sm">
                Convert <strong className="text-charcoal-200">{linkTarget?.display_name}</strong>'s guest profile to a permanent account.
              </p>
              {[
                { field: 'displayName', label: 'Display Name', type: 'text' },
                { field: 'username', label: 'Username', type: 'text' },
                { field: 'pin', label: 'PIN (4-6 digits)', type: 'password' },
              ].map(f => (
                <div key={f.field}>
                  <label className="block text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-1.5">
                    {f.label}
                  </label>
                  <input
                    type={f.type}
                    value={linkForm[f.field as keyof typeof linkForm]}
                    onChange={e => setLinkForm(x => ({ ...x, [f.field]: e.target.value }))}
                    className="input-field"
                  />
                </div>
              ))}
              {linkError && <p className="text-danger-400 text-sm">{linkError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowLinkModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleLinkGuest} disabled={linkLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {linkLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                  Link Account
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* Comparison Modal */}
      <Modal 
        isOpen={showCompareModal} 
        onClose={() => setShowCompareModal(false)} 
        title="Player Comparison"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-charcoal-800/50 border border-charcoal-700">
              <UserAvatar
                display_name={currentUser?.display_name}
                avatar_color={currentUser?.avatar_color}
                avatar_url={currentUser?.avatar_url}
                size="lg"
              />
              <p className="text-sm font-black text-charcoal-50 uppercase tracking-tight text-center truncate w-full">You</p>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-charcoal-800/50 border border-charcoal-700">
              <UserAvatar
                display_name={targetProfile.display_name}
                avatar_color={targetProfile.avatar_color}
                avatar_url={targetProfile.avatar_url}
                size="lg"
              />
              <p className="text-sm font-black text-charcoal-50 uppercase tracking-tight text-center truncate w-full">{targetProfile.display_name}</p>
            </div>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {['cricket', 'chip_off', 'golf', 'putt_vs_putt', 'darts'].map(sport => {
              const mySportStats = currentUserStats.find(s => s.sport === sport);
              const theirSportStats = stats.find(s => s.sport === sport);

              if (!mySportStats && !theirSportStats) return null;

              return (
                <div key={sport} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-charcoal-700" />
                    <h3 className="text-[10px] font-black text-accent-500 uppercase tracking-[0.3em] whitespace-nowrap">
                      {sport.replace('_', ' ')}
                    </h3>
                    <div className="h-px flex-1 bg-charcoal-700" />
                  </div>

                  <div className="space-y-2">
                    {sport === 'cricket' && (
                      <>
                        <ComparisonRow label="Strike Rate" val1={mySportStats?.strike_rate} val2={theirSportStats?.strike_rate} format="float" />
                        <ComparisonRow label="Economy" val1={mySportStats?.economy_rate} val2={theirSportStats?.economy_rate} format="float" lowerIsBetter />
                        <ComparisonRow label="Dot Ball %" val1={mySportStats?.dot_ball_percentage} val2={theirSportStats?.dot_ball_percentage} format="pct" />
                        <ComparisonRow label="Boundary %" val1={mySportStats?.boundary_percentage} val2={theirSportStats?.boundary_percentage} format="pct" />
                      </>
                    )}
                    {sport === 'chip_off' && (
                      <>
                        <ComparisonRow label="Efficiency" val1={mySportStats?.scoring_efficiency} val2={theirSportStats?.scoring_efficiency} format="pct" />
                        <ComparisonRow label="Ace Freq" val1={mySportStats?.ace_frequency} val2={theirSportStats?.ace_frequency} format="pct" />
                        <ComparisonRow label="Hazard Avoid" val1={mySportStats?.hazard_avoidance_rating} val2={theirSportStats?.hazard_avoidance_rating} format="pct" />
                        <ComparisonRow label="Avg Proximity" val1={mySportStats?.average_proximity_tier} val2={theirSportStats?.average_proximity_tier} format="float" lowerIsBetter />
                      </>
                    )}
                    {sport === 'darts' && (
                      <>
                        <ComparisonRow label="3-Dart Avg" val1={mySportStats?.countdown_ppr} val2={theirSportStats?.countdown_ppr} format="float" />
                        <ComparisonRow label="First 9 Avg" val1={mySportStats?.first_nine_ppr} val2={theirSportStats?.first_nine_ppr} format="float" />
                        <ComparisonRow label="Checkout %" val1={mySportStats?.checkout_pct} val2={theirSportStats?.checkout_pct} format="pct" />
                        <ComparisonRow label="ATW Efficiency" val1={mySportStats?.atw_efficiency} val2={theirSportStats?.atw_efficiency} format="float" lowerIsBetter />
                        <ComparisonRow label="Lethality %" val1={mySportStats?.killer_lethality} val2={theirSportStats?.killer_lethality} format="pct" />
                        <ComparisonRow label="Avg Survival" val1={mySportStats?.killer_survival} val2={theirSportStats?.killer_survival} format="float" />
                      </>
                    )}
                    {sport === 'putt_vs_putt' && (
                      <>
                        <ComparisonRow label="% Holed" val1={mySportStats?.career_pct_holed} val2={theirSportStats?.career_pct_holed} format="pct" />
                        <ComparisonRow label="Career Holes" val1={mySportStats?.holed_putts_total} val2={theirSportStats?.holed_putts_total} />
                        <ComparisonRow label="Clutch Putts" val1={mySportStats?.clutch_putts} val2={theirSportStats?.clutch_putts} />
                      </>
                    )}
                    <ComparisonRow label="Win Rate" 
                      val1={mySportStats ? (mySportStats.matches_won / (mySportStats.matches_played || 1)) * 100 : undefined} 
                      val2={theirSportStats ? (theirSportStats.matches_won / (theirSportStats.matches_played || 1)) * 100 : undefined} 
                      format="pct" 
                    />
                    <ComparisonRow label="Matches Won" val1={mySportStats?.matches_won} val2={theirSportStats?.matches_won} />
                  </div>
                </div>
              );
            })}
          </div>

          <button 
            onClick={() => setShowCompareModal(false)}
            className="w-full btn-secondary py-3 font-bold uppercase tracking-widest text-xs"
          >
            Close Comparison
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ComparisonRow({ label, val1, val2, format = 'int', lowerIsBetter = false }: { 
  label: string, 
  val1?: number, 
  val2?: number, 
  format?: 'int' | 'float' | 'pct',
  lowerIsBetter?: boolean
}) {
  const formatVal = (v?: number) => {
    if (v === undefined || v === null) return '-';
    if (format === 'float') return v.toFixed(2);
    if (format === 'pct') return `${v.toFixed(1)}%`;
    return Math.round(v);
  };

  const isBetter = (v1?: number, v2?: number) => {
    if (v1 === undefined || v2 === undefined) return null;
    if (v1 === v2) return null;
    return lowerIsBetter ? v1 < v2 : v1 > v2;
  };

  const better1 = isBetter(val1, val2);
  const better2 = isBetter(val2, val1);

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 p-2 rounded-xl text-center font-mono font-black text-sm transition-colors ${better1 ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-charcoal-800 text-charcoal-400'}`}>
        {formatVal(val1)}
      </div>
      <div className="w-24 text-center">
        <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-tighter leading-none">{label}</span>
      </div>
      <div className={`flex-1 p-2 rounded-xl text-center font-mono font-black text-sm transition-colors ${better2 ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-charcoal-800 text-charcoal-400'}`}>
        {formatVal(val2)}
      </div>
    </div>
  );
}
