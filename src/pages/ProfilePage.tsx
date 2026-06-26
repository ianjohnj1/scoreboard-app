import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, LogOut, Settings, Star, BarChart2, Users,
  Link as LinkIcon, Shield, Edit3, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { linkGuestAccount, getAllProfiles } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import type { Profile, PlayerCareerStats } from '../lib/supabase';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin } = useAuth();
  const [stats, setStats] = useState<PlayerCareerStats[]>([]);
  const [tab, setTab] = useState<'individual' | 'team'>('individual');
  const [guestProfiles, setGuestProfiles] = useState<Profile[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Profile | null>(null);
  const [linkForm, setLinkForm] = useState({ displayName: '', username: '', pin: '' });
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(async (isMounted?: () => boolean) => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from('player_career_stats')
      .select('*')
      .eq('profile_id', currentUser.id);
    
    if (isMounted && !isMounted()) return;

    if (error) {
      console.error("Error loading profile stats:", error);
      return;
    }
    setStats(data || []);
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    loadStats(() => mounted);

    if (currentUser && isAdmin) {
      getAllProfiles().then(profiles => {
        if (!mounted) return;
        setGuestProfiles(profiles.filter(p => p.is_guest && !p.linked_profile_id));
      });
    }
    return () => { mounted = false; };
  }, [currentUser, isAdmin, loadStats]);

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel(`profile-stats-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_career_stats',
          filter: `profile_id=eq.${currentUser.id}`
        },
        () => {
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

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
    if (!linkTarget) return;
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

  if (!currentUser) return null;

  const totalWins = stats.reduce((s, x) => s + x.matches_won, 0);
  const totalPlayed = stats.reduce((s, x) => s + x.matches_played, 0);
  const winPct = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-6 safe-top">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.display_name} color={currentUser.avatar_color} size="xl" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-charcoal-50">{currentUser.display_name}</h1>
                {isAdmin && <span className="pill-admin">Admin</span>}
              </div>
              {currentUser.username && (
                <p className="text-charcoal-400 text-sm">@{currentUser.username}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-charcoal-500">
                <span>{totalWins}W / {totalPlayed} games</span>
                <span>•</span>
                <span>{winPct}% win rate</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-400 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {/* Stats tabs */}
        <div className="flex bg-charcoal-800 rounded-xl p-1 border border-charcoal-700">
          {[{v:'individual',l:'Individual Stats'},{v:'team',l:'Team Stats'}].map(t => (
            <button
              key={t.v}
              onClick={() => setTab(t.v as typeof tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.v ? 'bg-accent-600 text-white' : 'text-charcoal-400'
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
              <div key={s.id} className="card p-4">
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
                {s.best_score != null && (
                  <p className="text-charcoal-400 text-xs mt-2">
                    Best score: <span className="text-charcoal-200 font-mono">{s.best_score}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Admin Panel */}
        {isAdmin && (
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
                          <Avatar name={guest.display_name} color={guest.avatar_color} size="sm" />
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

      {/* Link Guest Modal */}
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
    </div>
  );
}
