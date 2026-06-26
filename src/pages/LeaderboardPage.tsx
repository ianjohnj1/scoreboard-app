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

  const sports = ['all', 'cricket', 'chip_off', 'golf', 'darts', 'table_tennis', 'pool', 'basketball', 'cards', 'custom'];

  const loadLeaderboard = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch data from player_career_stats table
      let query = supabase
        .from('player_career_stats')
        .select('*, profiles(*)');

      if (sport !== 'all') {
        query = query.eq('sport', sport);
      }

      const { data, error: supabaseError } = await query;
      
      if (isMounted && !isMounted()) return;

      if (supabaseError) throw supabaseError;

      let processedData = (data || []).map((d: any) => ({
        ...d,
        profile: d.profiles as unknown as Profile
      }));

      // Aggregate if 'all' sports (Global MVP) is selected
      if (sport === 'all') {
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
              season_points: 0,
              best_score: null,
              extra_stats: {}
            };
          }
          acc[pid].matches_played += curr.matches_played;
          acc[pid].matches_won += curr.matches_won;
          acc[pid].matches_lost += curr.matches_lost;
          acc[pid].total_score += curr.total_score;
          acc[pid].season_points += curr.season_points;
          return acc;
        }, {});
        processedData = Object.values(aggregated);
      }

      // Sort based on selection
      processedData.sort((a, b) => {
        if (sport === 'all') return b.season_points - a.season_points;
        if (sport === 'golf') return (a.best_score ?? 999) - (b.best_score ?? 999);
        if (sport === 'cricket') return (b.cricket_lifetime_runs || 0) - (a.cricket_lifetime_runs || 0);
        if (sport === 'chip_off') return (b.golf_lifetime_points || 0) - (a.golf_lifetime_points || 0);
        return b.season_points - a.season_points;
      });

      setEntries(processedData.slice(0, 50));
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
          table: 'player_career_stats'
        },
        () => {
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
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 mb-6">
          <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
            {sports.map(s => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                  sport === s
                    ? 'bg-accent-600 border-accent-500 text-white shadow-lg shadow-accent-900/20'
                    : 'bg-charcoal-800 border-charcoal-700 text-charcoal-400 hover:text-charcoal-200'
                }`}
              >
                {s === 'all' ? '🏆 Global MVP' : getSportLabel(s)}
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
          <div className="space-y-4">
            {/* Podium for top 3 */}
            {entries.length >= 3 && (
              <div className="flex items-end justify-center gap-2 mb-8 mt-4 px-2">
                {/* 2nd Place */}
                <div className="flex flex-col items-center flex-1 max-w-[100px]">
                  <div className="relative mb-2">
                    <Avatar name={entries[1].profile?.display_name || '?'} color={entries[1].profile?.avatar_color} size="lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-charcoal-400 border-2 border-charcoal-900 flex items-center justify-center text-[10px] font-bold text-charcoal-900">2</div>
                  </div>
                  <p className="text-xs font-bold text-charcoal-200 truncate w-full text-center">{entries[1].profile?.display_name}</p>
                  <p className="text-[10px] text-charcoal-400 font-mono">
                    {sport === 'all' ? `${entries[1].season_points} SP` : 
                     sport === 'golf' ? `${entries[1].best_score} Best` :
                     sport === 'cricket' ? `${entries[1].cricket_lifetime_runs} Runs` :
                     `${entries[1].golf_lifetime_points} Pts`}
                  </p>
                  <div className="w-full h-12 bg-charcoal-700 rounded-t-lg mt-2 opacity-50"></div>
                </div>

                {/* 1st Place */}
                <div className="flex flex-col items-center flex-1 max-w-[120px] -mt-4">
                  <div className="relative mb-3">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <Trophy size={24} className="text-warning-400 drop-shadow-lg" />
                    </div>
                    <Avatar name={entries[0].profile?.display_name || '?'} color={entries[0].profile?.avatar_color} size="xl" />
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-warning-400 border-2 border-charcoal-900 flex items-center justify-center text-xs font-bold text-charcoal-900">1</div>
                  </div>
                  <p className="text-sm font-bold text-charcoal-50 truncate w-full text-center">{entries[0].profile?.display_name}</p>
                  <p className="text-xs text-warning-400 font-bold font-mono">
                    {sport === 'all' ? `${entries[0].season_points} SP` : 
                     sport === 'golf' ? `${entries[0].best_score} Best` :
                     sport === 'cricket' ? `${entries[0].cricket_lifetime_runs} Runs` :
                     `${entries[0].golf_lifetime_points} Pts`}
                  </p>
                  <div className="w-full h-20 bg-warning-500/10 border-t-2 border-warning-500/30 rounded-t-lg mt-2"></div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center flex-1 max-w-[100px]">
                  <div className="relative mb-2">
                    <Avatar name={entries[2].profile?.display_name || '?'} color={entries[2].profile?.avatar_color} size="lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cricket border-2 border-charcoal-900 flex items-center justify-center text-[10px] font-bold text-charcoal-900">3</div>
                  </div>
                  <p className="text-xs font-bold text-charcoal-200 truncate w-full text-center">{entries[2].profile?.display_name}</p>
                  <p className="text-[10px] text-charcoal-400 font-mono">
                    {sport === 'all' ? `${entries[2].season_points} SP` : 
                     sport === 'golf' ? `${entries[2].best_score} Best` :
                     sport === 'cricket' ? `${entries[2].cricket_lifetime_runs} Runs` :
                     `${entries[2].golf_lifetime_points} Pts`}
                  </p>
                  <div className="w-full h-8 bg-charcoal-700 rounded-t-lg mt-2 opacity-30"></div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {entries.map((entry, rank) => {
                const renderStats = () => {
                  if (sport === 'cricket') {
                    return (
                      <div className="flex gap-4 text-xs font-mono">
                        <div className="flex flex-col items-end">
                          <span className="text-charcoal-500 uppercase text-[8px]">Runs</span>
                          <span className="text-charcoal-100 font-bold">{entry.cricket_lifetime_runs || 0}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-charcoal-500 uppercase text-[8px]">Wkts</span>
                          <span className="text-danger-400 font-bold">{entry.cricket_lifetime_wickets || 0}</span>
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
                          <span className="text-warning-400 font-bold">{entry.golf_lifetime_hio || 0}</span>
                        </div>
                      </div>
                    );
                  }
                  if (sport === 'chip_off') {
                    return (
                      <div className="flex gap-4 text-xs font-mono">
                        <div className="flex flex-col items-end">
                          <span className="text-charcoal-500 uppercase text-[8px]">Points</span>
                          <span className="text-accent-400 font-bold">{entry.golf_lifetime_points || 0}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-charcoal-500 uppercase text-[8px]">10s</span>
                          <span className="text-warning-400 font-bold">{entry.golf_lifetime_hio || 0}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="text-right flex-shrink-0">
                      <p className="text-warning-400 font-bold font-mono text-sm">{entry.season_points} SP</p>
                      <p className="text-charcoal-400 text-[10px] font-mono">{entry.matches_won}W • {entry.matches_played}G</p>
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
                      {rank + 1}
                    </div>
                    <Avatar name={entry.profile?.display_name || '?'} color={entry.profile?.avatar_color} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-charcoal-100 font-semibold text-sm truncate">{entry.profile?.display_name}</p>
                        {entry.profile?.is_guest && <span className="pill-guest text-[10px] px-1.5 py-0.5">Guest</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-charcoal-500 text-[10px] uppercase tracking-wider">{getSportLabel(entry.sport)}</p>
                      </div>
                    </div>
                    {renderStats()}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
