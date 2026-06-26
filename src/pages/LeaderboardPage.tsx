import React, { useEffect, useState, useCallback } from 'react';
import { Trophy, Star, TrendingUp, RotateCcw, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSportLabel } from '../lib/matches';
import { getGlobalLeaderboardData } from '../lib/stats';
import Avatar from '../components/Avatar';
import type { Profile, PlayerCareerStats } from '../lib/supabase';

type LeaderboardEntry = PlayerCareerStats & { profile: Profile; rankScore: number };

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sport, setSport] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const sports = ['all', 'cricket', 'golf', 'chip_off', 'darts', 'table_tennis', 'pool', 'basketball', 'cards', 'custom'];

  const loadLeaderboard = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch live aggregated data directly from events/matches
      const data = await getGlobalLeaderboardData();
      
      if (isMounted && !isMounted()) return;

      let processedData = data;

      // Filter by sport if not 'all'
      if (sport !== 'all') {
        processedData = processedData.filter(d => d.sport === sport);
      } else {
        // Aggregate if 'all' sports is selected
        const aggregated = processedData.reduce((acc: Record<string, any>, curr) => {
          const pid = curr.profile_id;
          if (!acc[pid]) {
            acc[pid] = {
              ...curr,
              sport: 'all',
              matches_played: 0,
              matches_won: 0,
              matches_lost: 0,
              total_score: 0,
              best_score: null,
              extra_stats: {}
            };
          }
          acc[pid].matches_played += curr.matches_played;
          acc[pid].matches_won += curr.matches_won;
          acc[pid].matches_lost += curr.matches_lost;
          acc[pid].total_score += curr.total_score;
          return acc;
        }, {});
        processedData = Object.values(aggregated);
      }

      // Calculate normalized rank_score for each entry
      const dataWithScores: LeaderboardEntry[] = processedData.map(entry => {
        const winRate = entry.matches_played > 0 ? entry.matches_won / entry.matches_played : 0;
        // normalized rank_score: (wins * 100) + (winRate * 50) + (participation * 5)
        const rankScore = (entry.matches_won * 100) + (winRate * 50) + (entry.matches_played * 5);
        return { ...entry, rankScore };
      });

      // In-memory sorting for more complex criteria
      dataWithScores.sort((a, b) => {
        if (sport === 'golf') {
          // Lower score is better for golf
          return (a.best_score ?? 999) - (b.best_score ?? 999);
        } else if (sport === 'cricket') {
          const extraA = a.extra_stats as any;
          const extraB = b.extra_stats as any;
          const runsA = extraA?.runs || 0;
          const runsB = extraB?.runs || 0;
          if (runsB !== runsA) return runsB - runsA;
          return (extraB?.wickets || 0) - (extraA?.wickets || 0);
        } else if (sport === 'chip_off') {
          const extraA = a.extra_stats as any;
          const extraB = b.extra_stats as any;
          const ptsA = extraA?.points || 0;
          const ptsB = extraB?.points || 0;
          if (ptsB !== ptsA) return ptsB - ptsA;
          return (extraB?.tens || 0) - (extraA?.tens || 0);
        }
        
        // Default sort by rankScore
        return b.rankScore - a.rankScore;
      });

      setEntries(dataWithScores.slice(0, 50));
    } catch (err: any) {
      console.error("Error loading leaderboard:", err);
      if (isMounted && !isMounted()) return;
      
      if (!navigator.onLine) {
        setError("No internet connection.");
      } else {
        setError("Failed to load leaderboard.");
      }
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    let mounted = true;
    loadLeaderboard(() => mounted);
    return () => { mounted = false; };
  }, [loadLeaderboard]);

  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_rooms',
          filter: 'status=eq.completed'
        },
        () => {
          setRefreshKey(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events'
        },
        () => {
          // Debounce slightly to avoid too many refreshes if multiple events come in
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      loadLeaderboard();
    }
  }, [refreshKey, loadLeaderboard]);

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-warning-400" />
          <h1 className="text-xl font-bold text-charcoal-50">Leaderboards</h1>
        </div>
        <p className="text-charcoal-400 text-sm">Global rankings across all sports</p>
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
              onClick={() => {
                let mounted = true;
                loadLeaderboard(() => mounted);
              }}
              className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-700 text-white text-sm font-bold rounded-lg transition-all flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        {/* Sport filter */}
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 mb-4">
          <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
            {sports.map(s => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  sport === s
                    ? 'bg-accent-600 border-accent-500 text-white'
                    : 'bg-charcoal-800 border-charcoal-700 text-charcoal-400 hover:text-charcoal-200'
                }`}
              >
                {s === 'all' ? 'All Sports' : getSportLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 card shimmer-bg rounded-xl" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="card p-8 text-center">
            <Trophy size={32} className="text-charcoal-600 mx-auto mb-3" />
            <p className="text-charcoal-400">No stats yet. Play some games!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, rank) => {
              const winPct = entry.matches_played > 0
                ? Math.round((entry.matches_won / entry.matches_played) * 100)
                : 0;
              
              const renderStats = () => {
                if (sport === 'cricket') {
                  return (
                    <div className="flex gap-4 text-xs font-mono">
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">Runs</span>
                        <span className="text-charcoal-100 font-bold">{entry.extra_stats?.runs || 0}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">Wkts</span>
                        <span className="text-danger-400 font-bold">{entry.extra_stats?.wickets || 0}</span>
                      </div>
                    </div>
                  );
                }
                if (sport === 'golf') {
                  return (
                    <div className="flex gap-4 text-xs font-mono">
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">Best</span>
                        <span className="text-success-400 font-bold">{entry.best_score || '-'}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">HIO</span>
                        <span className="text-warning-400 font-bold">{entry.extra_stats?.hio || 0}</span>
                      </div>
                    </div>
                  );
                }
                if (sport === 'chip_off') {
                  return (
                    <div className="flex gap-4 text-xs font-mono">
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">Points</span>
                        <span className="text-accent-400 font-bold">{entry.extra_stats?.points || 0}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-charcoal-500 uppercase text-[8px]">10s</span>
                        <span className="text-warning-400 font-bold">{entry.extra_stats?.tens || 0}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="text-right flex-shrink-0">
                    <p className="text-charcoal-100 font-bold font-mono text-sm">{entry.matches_won}W</p>
                    <p className="text-charcoal-400 text-xs font-mono">{winPct}% • {entry.matches_played}GP</p>
                  </div>
                );
              };

              return (
                <div key={entry.id} className={`card p-3 flex items-center gap-3 ${
                  rank === 0 ? 'border-warning-500/40 bg-warning-500/5' :
                  rank === 1 ? 'border-charcoal-400/40' :
                  rank === 2 ? 'border-cricket/30' : ''
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    rank === 0 ? 'bg-warning-500/20 text-warning-400' :
                    rank === 1 ? 'bg-charcoal-600/50 text-charcoal-300' :
                    rank === 2 ? 'bg-cricket/20 text-cricket' :
                    'bg-charcoal-700 text-charcoal-400'
                  }`}>
                    {rank === 0 ? <Trophy size={14} /> : rank + 1}
                  </div>
                  <Avatar name={entry.profile?.display_name || '?'} color={entry.profile?.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-charcoal-100 font-semibold text-sm truncate">{entry.profile?.display_name}</p>
                      {entry.profile?.is_guest && <span className="pill-guest text-xs">Guest</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-charcoal-500 text-[10px] uppercase tracking-wider">{getSportLabel(entry.sport)}</p>
                      {sport !== 'all' && (
                        <span className="text-charcoal-600 text-[10px]">• {entry.matches_won}W / {entry.matches_played}G</span>
                      )}
                    </div>
                  </div>
                  {renderStats()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
