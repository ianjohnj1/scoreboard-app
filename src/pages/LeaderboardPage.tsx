import React, { useEffect, useState } from 'react';
import { Trophy, Star, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSportLabel } from '../lib/matches';
import Avatar from '../components/Avatar';
import type { Profile, PlayerCareerStats } from '../lib/supabase';

type LeaderboardEntry = PlayerCareerStats & { profile: Profile };

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sport, setSport] = useState('all');
  const [loading, setLoading] = useState(true);

  const sports = ['all', 'cricket', 'golf', 'darts', 'table_tennis', 'pool', 'basketball', 'cards', 'custom'];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('player_career_stats')
        .select('*, profiles(*)')
        .order('matches_won', { ascending: false })
        .limit(50);

      if (sport !== 'all') query = query.eq('sport', sport);

      const { data } = await query;
      setEntries((data || []).map((d: LeaderboardEntry) => ({ ...d, profile: d.profiles as unknown as Profile })));
      setLoading(false);
    };
    load();
  }, [sport]);

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
                    <p className="text-charcoal-500 text-xs">{getSportLabel(entry.sport)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-charcoal-100 font-bold font-mono text-sm">{entry.matches_won}W</p>
                    <p className="text-charcoal-400 text-xs font-mono">{winPct}% • {entry.matches_played}GP</p>
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
