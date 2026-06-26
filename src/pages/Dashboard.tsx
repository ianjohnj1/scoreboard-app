import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus, Trophy, Activity, Clock, ChevronRight,
  QrCode, Zap, Crown, BarChart2, Trash2, RotateCcw
} from 'lucide-react';
import Avatar from '../components/Avatar';
import QRCodeModal from '../components/QRCodeModal';
import { useAuth } from '../contexts/AuthContext';
import { getRecentMatches, getActiveMatches, getLiveActivity, deleteMatch, getSportIcon, getSportLabel } from '../lib/matches';

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [activeMatches, setActiveMatches] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [liveActivity, setLiveActivity] = useState<any[]>([]);
  const [topStats, setTopStats] = useState<any[]>([]);
  const [qrMatch, setQrMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [recent, active, live] = await Promise.all([
        getRecentMatches(5),
        getActiveMatches(),
        getLiveActivity()
      ]);

      if (isMounted && !isMounted()) return;

      setRecentMatches(recent);
      setActiveMatches(active);
      setLiveActivity(live);
    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
      if (isMounted && !isMounted()) return;
      
      // Handle network errors gracefully
      if (!navigator.onLine) {
        setError("No internet connection. Please check your network.");
      } else {
        setError("Failed to load dashboard. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && currentUser) {
      let mounted = true;
      loadDashboardData(() => mounted);
      return () => { mounted = false; };
    }
  }, [authLoading, currentUser, loadDashboardData]);

  const handleDeleteMatch = useCallback(async (matchId: string) => {
    if (deletingId) return;
    if (!window.confirm('Are you sure you want to delete this match? This cannot be undone.')) return;
    
    setDeletingId(matchId);
    try {
      await deleteMatch(matchId);
      await loadDashboardData();
    } catch (error: any) {
      console.error("Error deleting match:", error);
      const message = error.message || "Unknown error";
      const code = error.code || "";
      
      if (code === '42501') {
        alert("Permission Denied: You don't have permission to delete this match.");
      } else {
        alert(`Failed to delete match: ${message}`);
      }
    } finally {
      setDeletingId(null);
    }
  }, [deletingId, loadDashboardData]);

  if (authLoading || (loading && !currentUser)) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) return null;

  const displayName = currentUser?.display_name || 'Player';
  const avatarColor = currentUser?.avatar_color || 'bg-charcoal-700';

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24 text-white">
      {/* Header */}
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-charcoal-400 text-sm">Welcome back,</p>
            <h1 className="text-xl font-bold text-charcoal-50">{displayName}</h1>
          </div>
          <Avatar name={displayName} color={avatarColor} size="md" />
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Error State */}
        {error && (
          <div className="bg-danger-900/20 border border-danger-500/30 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="w-12 h-12 bg-danger-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap size={24} className="text-danger-400" />
            </div>
            <h3 className="text-white font-bold mb-2">Something went wrong</h3>
            <p className="text-charcoal-400 text-sm mb-6 leading-relaxed">
              {error}
            </p>
            <button
              onClick={() => {
                let mounted = true;
                loadDashboardData(() => mounted);
              }}
              className="px-6 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={16} />
              Try Again
            </button>
          </div>
        )}

        {/* Start Match CTA */}
        <button
          onClick={() => navigate('/new-match')}
          className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600
                     rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-emerald-900/50
                     active:scale-[0.98] transition-all duration-150 group text-left"
        >
          <div>
            <p className="text-emerald-200 text-sm font-medium">Ready to play?</p>
            <h2 className="text-white text-2xl font-bold mt-0.5">Start New Match</h2>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center
                          group-hover:bg-white/20 transition-colors">
            <Plus size={28} className="text-white" />
          </div>
        </button>

        {/* Champions Showcase */}
        {topStats.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Crown size={16} className="text-amber-400" />
              <h2 className="text-sm font-bold text-charcoal-300 uppercase tracking-wider">Champions</h2>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
              <div className="flex gap-3 pb-1" style={{ width: 'max-content' }}>
                {topStats.map((stat, i) => (
                  <div
                    key={i}
                    className="bg-charcoal-800 border border-charcoal-700 rounded-xl min-w-[140px] p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-1">
                      <Trophy size={12} className="text-amber-400" />
                      <span className="text-xs text-charcoal-400 truncate">{stat.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar name={stat.player.display_name} color={stat.player.avatar_color} size="sm" />
                      <div>
                        <p className="text-charcoal-100 font-semibold text-sm leading-tight truncate max-w-[80px]">
                          {stat.player.display_name}
                        </p>
                        <p className="text-emerald-400 text-xs font-mono">{stat.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Live Activity */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-bold text-charcoal-300 uppercase tracking-wider">Live Activity</h2>
          </div>

          <div className="space-y-2">
            {liveActivity.map(({ session, profile, match }) => {
              if (!profile || !match) return null;
              const sportLabel = getSportLabel(match.sport || 'custom', match.custom_game_name);
              const sportIcon = getSportIcon(match.sport || 'custom');
              
              return (
                <div key={session.id} className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Avatar name={profile.display_name || 'Player'} color={profile.avatar_color || 'bg-charcoal-700'} size="sm" />
                    <div className="min-w-0">
                      <p className="text-charcoal-100 font-semibold text-sm">
                        <span className="text-emerald-400">{profile.display_name || 'Player'}</span> is hosting{' '}
                        <span className="text-charcoal-200">
                          {sportIcon} {sportLabel} ({match.room_code || '....'})
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setQrMatch(match)}
                      className="p-2 rounded-lg bg-charcoal-700 hover:bg-charcoal-600 text-charcoal-300 transition-colors"
                    >
                      <QrCode size={16} />
                    </button>
                    <Link
                      to={`/match/${match.room_code}`}
                      className="p-2 rounded-lg bg-emerald-700/50 hover:bg-emerald-600/50 text-emerald-300 transition-colors"
                    >
                      <Zap size={16} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Active Matches */}
        {activeMatches.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-charcoal-300 uppercase tracking-wider">Active Matches</h2>
              </div>
            </div>
            <div className="space-y-2">
              {activeMatches.map(match => {
                if (!match) return null;
                return (
                  <MatchCard 
                    key={match.id} 
                    match={match} 
                    onQR={() => setQrMatch(match)} 
                    onDelete={() => handleDeleteMatch(match.id)}
                    canDelete={isAdmin}
                    isDeleting={deletingId === match.id}
                  />
                );
              })}
            </div>
        </section>
      )}

      {/* Recent Matches */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-charcoal-400" />
            <h2 className="text-sm font-bold text-charcoal-300 uppercase tracking-wider">Recent Matches</h2>
          </div>
        </div>
        <div className="space-y-2">
          {recentMatches.map(match => {
            if (!match) return null;
            return (
              <MatchCard 
                key={match.id} 
                match={match} 
                onQR={() => setQrMatch(match)} 
                onDelete={() => handleDeleteMatch(match.id)}
                canDelete={isAdmin}
                isDeleting={deletingId === match.id}
              />
            );
          })}
        </div>
        </section>
      </div>

      {/* QR Code Modal */}
      {qrMatch && (
        <QRCodeModal
          match={qrMatch}
          onClose={() => setQrMatch(null)}
        />
      )}
    </div>
  );
}

function MatchCard({ 
  match, onQR, onDelete, canDelete, isDeleting 
}: { 
  match: any; onQR: () => void; onDelete: () => void; canDelete: boolean; isDeleting: boolean 
}) {
  const navigate = useNavigate();
  if (!match) return null;

  const isLive = match.status === 'active';
  const sportLabel = getSportLabel(match.sport || 'custom', match.custom_game_name);
  const sportIcon = getSportIcon(match.sport || 'custom');

  const handleCardClick = () => {
    if (isDeleting) return;
    if (match.room_code) {
      navigate(`/match/${match.room_code}`);
    }
  };

  return (
    <div className={`bg-charcoal-800 border border-charcoal-700 rounded-xl p-3 flex items-center gap-3 hover:border-charcoal-600 transition-all duration-150 ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-charcoal-700 flex items-center justify-center text-xl flex-shrink-0">
        {sportIcon}
      </div>
      <div className="flex-1 min-w-0" onClick={handleCardClick} style={{ cursor: isDeleting ? 'default' : 'pointer' }}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-charcoal-100 text-sm truncate">
            {sportLabel}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isLive ? 'bg-emerald-950 text-emerald-400' : 'bg-charcoal-700 text-charcoal-400'}`}>
            {isLive ? 'Live' : 'Done'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-charcoal-500 text-xs font-mono">{match.room_code || '....'}</span>
          <span className="text-charcoal-600 text-xs">•</span>
          <span className="text-charcoal-500 text-xs">
            {match.match_time ? new Date(match.match_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isDeleting ? (
          <div className="p-2">
            <div className="w-4 h-4 border-2 border-charcoal-400 border-t-charcoal-200 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {isLive && (
              <button
                onClick={(e) => { e.stopPropagation(); onQR(); }}
                className="p-2 rounded-lg hover:bg-charcoal-700 text-charcoal-400 transition-colors"
              >
                <QrCode size={16} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 rounded-lg hover:bg-danger-900/30 text-danger-400 hover:text-danger-300 transition-colors"
                title="Delete Match"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/match/${match.room_code}`); }}
              className="p-2 rounded-lg hover:bg-charcoal-700 text-charcoal-400 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}