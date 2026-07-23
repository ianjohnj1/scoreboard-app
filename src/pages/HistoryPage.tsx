import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Lock, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { getRecentMatches, getSportIcon, getSportLabel, deleteMatch } from '../lib/matches';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import type { MatchRoom } from '../lib/supabase';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState<MatchRoom[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecentMatches(50);
      if (isMounted && !isMounted()) return;
      setMatches(data || []);
    } catch (err: any) {
      console.error("Error loading history:", err);
      if (isMounted && !isMounted()) return;
      
      if (!navigator.onLine) {
        setError("No internet connection.");
      } else {
        setError("Failed to load history.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    load(() => mounted);
    return () => { mounted = false; };
  }, [load]);

  const handleDeleteMatch = async (e: React.MouseEvent, matchId: string) => {
    e.stopPropagation();
    if (deletingId) return;
    if (!window.confirm('Are you sure you want to delete this match?')) return;
    
    setDeletingId(matchId);
    try {
      await deleteMatch(matchId);
      await load();
    } catch (error) {
      console.error("Error deleting match:", error);
      alert("Failed to delete match.");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = matches.filter(m => {
    if (!m) return false;
    if (filter === 'active') return m.status === 'active' || m.status === 'paused';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top flex justify-between items-center transition-colors duration-300">
        <div>
          <h1 className="text-xl font-bold text-charcoal-50">Match History</h1>
          <p className="text-charcoal-400 text-sm">All games, all time</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Error State */}
        {error && (
          <div className="bg-danger-900/20 border border-danger-500/30 rounded-xl p-6 text-center mb-4">
            <div className="flex items-center justify-center gap-3 text-danger-400 mb-4">
              <AlertCircle size={20} />
              <span className="font-bold">{error}</span>
            </div>
            <button
              onClick={() => load()}
              className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-50 text-sm font-bold rounded-lg transition-all flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex bg-charcoal-800 rounded-xl p-1 border border-charcoal-700 mb-4">
          {[{ v: 'all', l: 'All' }, { v: 'active', l: 'Active' }, { v: 'completed', l: 'Completed' }].map(f => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v as typeof filter)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f.v ? 'bg-accent-600 text-charcoal-50' : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 card shimmer-bg rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <Clock size={32} className="text-charcoal-600 mx-auto mb-3" />
            <p className="text-charcoal-400">No matches found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(match => {
              if (!match) return null;
              return (
                <div
                  key={match.id}
                  onClick={() => !deletingId && navigate(`/match/${match.room_code}`)}
                  className={`w-full card p-4 flex items-center gap-3 hover:border-charcoal-600 active:scale-[0.99] transition-all text-left cursor-pointer ${deletingId === match.id ? 'opacity-50 grayscale pointer-events-none' : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-charcoal-700 flex items-center justify-center text-xl flex-shrink-0">
                    {getSportIcon(match.sport || 'custom')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-charcoal-100 text-sm">
                        {getSportLabel(match.sport || 'custom', match.custom_game_name, match.house_rules?.variant as string | undefined)}
                      </span>
                      <span className={`pill text-xs ${
                        match.status === 'active' ? 'pill-active' :
                        match.status === 'paused' ? 'pill-paused' : 'pill-completed'
                      }`}>
                        {match.status === 'active' ? 'Live' : match.status === 'paused' ? 'Paused' : 'Completed'}
                      </span>
                      {match.status === 'completed' && !isAdmin && (
                        <Lock size={12} className="text-charcoal-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-charcoal-500 text-xs font-mono">{match.room_code || '....'}</span>
                      <span className="text-charcoal-600 text-xs">•</span>
                      <span className="text-charcoal-500 text-xs">
                        {match.match_time ? new Date(match.match_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {deletingId === match.id ? (
                      <div className="p-2">
                        <div className="w-4 h-4 border-2 border-charcoal-400 border-t-charcoal-200 rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDeleteMatch(e, match.id)}
                            className="p-2 rounded-lg hover:bg-danger-900/30 text-danger-400 hover:text-danger-300 transition-colors"
                            title="Delete Match"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                        <ChevronRight size={16} className="text-charcoal-500 flex-shrink-0" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
