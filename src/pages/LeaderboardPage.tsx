import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Star, TrendingUp, RotateCcw, AlertCircle, Info, Target, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSportLabel } from '../lib/matches';
import { getGlobalLeaderboardData, SEASON_POINT_RULES } from '../lib/stats';
import Avatar from '../components/Avatar';
import ThemeToggle from '../components/ThemeToggle';
import Modal from '../components/Modal';
import type { Profile, PlayerCareerStats } from '../lib/supabase';

type LeaderboardEntry = PlayerCareerStats & { profile: Profile; rankScore: number; best_sport?: string; chip_off_total_chips?: number; chip_off_scoring_chips?: number; best_score_classic?: number; best_score_chip_off?: number; };

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sport, setSport] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSPModal, setShowSPModal] = useState(false);

  const sports = ['all', 'cricket', 'golf', 'darts', 'table_tennis', 'pool', 'basketball', 'cards', 'custom'];

  const loadLeaderboard = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all-time stats aggregated from events
      const data = await getGlobalLeaderboardData();
      
      if (isMounted && !isMounted()) return;

      let processedData = [...data];

      // Filter by sport if not 'all'
      if (sport !== 'all') {
        processedData = processedData.filter(d => d.sport === sport);
      }

      // Aggregate if 'all' sports (Global MVP) is selected
      if (sport === 'all') {
        const aggregated = processedData.reduce((acc: Record<string, any>, curr) => {
          const pid = curr.profile_id;
          if (!acc[pid]) {
            acc[pid] = {
              ...curr,
              sport: 'all',
              best_sport: curr.sport,
              max_sport_sp: curr.season_points,
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
          
          if (curr.season_points > acc[pid].max_sport_sp) {
            acc[pid].max_sport_sp = curr.season_points;
            acc[pid].best_sport = curr.sport;
          }

          return acc;
        }, {});
        processedData = Object.values(aggregated);
      }

      // Sort based on selection
      processedData.sort((a, b) => {
        if (sport === 'all') return b.season_points - a.season_points;
        if (sport === 'golf') return b.season_points - a.season_points;
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
          table: 'match_rooms',
          filter: 'status=eq.completed'
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
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top flex justify-between items-center transition-colors duration-300">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-warning-400" />
            <h1 className="text-xl font-bold text-charcoal-50">Leaderboards</h1>
          </div>
          <p className="text-charcoal-400 text-sm">Global rankings across all sports</p>
          <button 
            onClick={() => setShowSPModal(true)} 
            className="text-accent-400 text-xs mt-1 hover:underline flex items-center gap-1 font-bold"
          >
            <Info size={12} /> How are Season Points calculated?
          </button>
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
              onClick={() => {
                let mounted = true;
                loadLeaderboard(() => mounted);
              }}
              className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-50 text-sm font-bold rounded-lg transition-all flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        {/* Sport filter */}
        <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex overflow-x-auto sm:flex-wrap gap-2 pb-2 sm:pb-0 no-scrollbar snap-x">
            {sports.map(s => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`snap-start whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                  sport === s
                    ? 'bg-accent-600 border-accent-500 text-charcoal-50 shadow-lg shadow-accent-900/20'
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
                  <Link to={`/profile/${entries[1].profile_id}`} className="flex flex-col items-center group">
                    <div className="relative mb-2 transition-transform group-hover:scale-105">
                      <Avatar name={entries[1].profile?.display_name || '?'} color={entries[1].profile?.avatar_color} size="lg" url={entries[1].profile?.avatar_url} />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-charcoal-400 border-2 border-charcoal-900 flex items-center justify-center text-[10px] font-bold text-charcoal-900">2</div>
                    </div>
                    <p className="text-xs font-bold text-charcoal-200 truncate w-full text-center group-hover:text-charcoal-50">{entries[1].profile?.display_name}</p>
                    {entries[1].profile?.catchphrase && (
                      <p className="text-[10px] italic text-accent-400 truncate w-full text-center px-1">"{entries[1].profile.catchphrase}"</p>
                    )}
                  </Link>
                  <p className="text-[10px] text-charcoal-400 font-mono">
                    {sport === 'all' || sport === 'golf' ? `${entries[1].season_points} SP` : 
                     sport === 'cricket' ? `${entries[1].cricket_lifetime_runs} Runs` :
                     `${entries[1].golf_lifetime_points} Pts`}
                  </p>
                  <div className="w-full h-12 bg-charcoal-700 rounded-t-lg mt-2 opacity-50"></div>
                </div>

                {/* 1st Place */}
                <div className="flex flex-col items-center flex-1 max-w-[120px] -mt-4">
                  <Link to={`/profile/${entries[0].profile_id}`} className="flex flex-col items-center group">
                    <div className="relative mb-3 transition-transform group-hover:scale-105">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                        <Trophy size={24} className="text-warning-400 drop-shadow-lg" />
                      </div>
                      <Avatar name={entries[0].profile?.display_name || '?'} color={entries[0].profile?.avatar_color} size="xl" url={entries[0].profile?.avatar_url} />
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-warning-400 border-2 border-charcoal-900 flex items-center justify-center text-xs font-bold text-charcoal-900">1</div>
                    </div>
                    <p className="text-sm font-bold text-charcoal-50 truncate w-full text-center group-hover:text-charcoal-50">{entries[0].profile?.display_name}</p>
                    {entries[0].profile?.catchphrase && (
                      <p className="text-[10px] italic text-accent-400 truncate w-full text-center px-1">"{entries[0].profile.catchphrase}"</p>
                    )}
                  </Link>
                  <p className="text-xs text-warning-400 font-bold font-mono">
                    {sport === 'all' || sport === 'golf' ? `${entries[0].season_points} SP` : 
                     sport === 'cricket' ? `${entries[0].cricket_lifetime_runs} Runs` :
                     `${entries[0].golf_lifetime_points} Pts`}
                  </p>
                  <div className="w-full h-20 bg-warning-500/10 border-t-2 border-warning-500/30 rounded-t-lg mt-2"></div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center flex-1 max-w-[100px]">
                  <Link to={`/profile/${entries[2].profile_id}`} className="flex flex-col items-center group">
                    <div className="relative mb-2 transition-transform group-hover:scale-105">
                      <Avatar name={entries[2].profile?.display_name || '?'} color={entries[2].profile?.avatar_color} size="lg" url={entries[2].profile?.avatar_url} />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cricket border-2 border-charcoal-900 flex items-center justify-center text-[10px] font-bold text-charcoal-900">3</div>
                    </div>
                    <p className="text-xs font-bold text-charcoal-200 truncate w-full text-center group-hover:text-charcoal-50">{entries[2].profile?.display_name}</p>
                    {entries[2].profile?.catchphrase && (
                      <p className="text-[10px] italic text-accent-400 truncate w-full text-center px-1">"{entries[2].profile.catchphrase}"</p>
                    )}
                  </Link>
                  <p className="text-[10px] text-charcoal-400 font-mono">
                    {sport === 'all' || sport === 'golf' ? `${entries[2].season_points} SP` : 
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
                      <div className="flex gap-3 text-xs font-mono whitespace-nowrap overflow-x-auto no-scrollbar">
                        <div className="flex flex-col items-end min-w-[36px]">
                          <span className="text-charcoal-500 uppercase text-[8px]">Played</span>
                          <span className="text-charcoal-100 font-bold">{entry.matches_played || 0}</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[36px]">
                          <span className="text-charcoal-500 uppercase text-[8px]">Wins</span>
                          <span className="text-success-400 font-bold">{entry.matches_won || 0}</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[36px]">
                          <span className="text-charcoal-500 uppercase text-[8px]">Best (Classic)</span>
                          <span className="text-success-400 font-bold">{entry.best_score_classic || '-'}</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[36px]">
                          <span className="text-charcoal-500 uppercase text-[8px]">Best (Chip)</span>
                          <span className="text-success-400 font-bold">{entry.best_score_chip_off || '-'}</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[36px]">
                          <span className="text-charcoal-500 uppercase text-[8px]">HIO</span>
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
                    <Link to={`/profile/${entry.profile_id}`} className="flex flex-1 items-center gap-3 min-w-0 group">
                      <Avatar name={entry.profile?.display_name || '?'} color={entry.profile?.avatar_color} size="sm" url={entry.profile?.avatar_url} className="group-hover:scale-105 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-charcoal-100 font-semibold text-sm truncate group-hover:text-charcoal-50">{entry.profile?.display_name}</p>
                          {entry.profile?.is_guest && <span className="pill-guest text-[10px] px-1.5 py-0.5">Guest</span>}
                        </div>
                        {entry.profile?.catchphrase && (
                          <p className="text-accent-400 text-[10px] italic truncate mt-0.5">"{entry.profile.catchphrase}"</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-charcoal-500 text-[10px] uppercase tracking-wider">
                            {sport === 'all' && entry.best_sport
                              ? `Best Sport: ${getSportLabel(entry.best_sport)}`
                              : getSportLabel(entry.sport)}
                          </p>
                        </div>
                      </div>
                    </Link>
                    {renderStats()}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showSPModal} onClose={() => setShowSPModal(false)} title="Season Points (SP)">
        <div className="space-y-6">
          <p className="text-charcoal-300 text-sm leading-relaxed">
            Season Points determine your rank on the Global MVP leaderboard. You earn them by completing matches and hitting milestones.
          </p>

          <div>
            <h3 className="text-charcoal-50 font-black uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
              <Trophy size={14} className="text-warning-400" /> Match Placements
            </h3>
            <div className="space-y-2">
              {SEASON_POINT_RULES.placement.map((rule, idx) => (
                <div key={idx} className="flex justify-between items-center bg-charcoal-800 p-3 rounded-xl border border-charcoal-700">
                  <span className="text-charcoal-200 text-sm font-semibold">{rule.label}</span>
                  <span className="text-warning-400 font-black font-mono">+{rule.points} SP</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-charcoal-50 font-black uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
              <Activity size={14} className="text-cricket" /> Cricket Milestones
            </h3>
            <div className="space-y-2">
              {SEASON_POINT_RULES.milestones.cricket.map((rule, idx) => (
                <div key={idx} className="flex justify-between items-center bg-charcoal-800 p-3 rounded-xl border border-charcoal-700">
                  <span className="text-charcoal-200 text-sm font-semibold">{rule.label}</span>
                  <span className="text-cricket font-black font-mono">+{rule.points} SP</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-charcoal-50 font-black uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
              <Target size={14} className="text-success-400" /> Golf Milestones
            </h3>
            <div className="space-y-2">
              {SEASON_POINT_RULES.milestones.golf.map((rule, idx) => (
                <div key={idx} className="flex justify-between items-center bg-charcoal-800 p-3 rounded-xl border border-charcoal-700">
                  <span className="text-charcoal-200 text-sm font-semibold">{rule.label}</span>
                  <span className="text-success-400 font-black font-mono">+{rule.points} SP</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowSPModal(false)}
            className="w-full py-3 bg-accent-600 hover:bg-accent-500 text-charcoal-50 font-black rounded-xl shadow-lg shadow-accent-900/40 transition-all uppercase tracking-widest text-sm"
          >
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}
