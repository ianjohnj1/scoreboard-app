import { useState } from 'react';
import { recordEvent } from '../../lib/matches';
import UserAvatar from '../UserAvatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile } from '../../lib/supabase';

export default function BasketballRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const teamProfiles = teams.map(team =>
    players
      .filter(player => player.team_id === team?.id)
      .map(player => profiles.get(player.profile_id))
      .filter(Boolean) as Profile[]
  );

  const addPoints = async (teamIdx: 0 | 1, pts: 1 | 2 | 3) => {
    const newS: [number, number] = [...scores] as [number, number];
    newS[teamIdx] += pts;
    setScores(newS);
    await recordEvent(match.id, 'bball_score', { team: teamIdx, pts, scores: newS }, undefined, teams[teamIdx]?.id, currentUser?.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1">
        {[0, 1].map(idx => {
          const team = teams[idx];
          const color = idx === 0 ? '#3b82f6' : '#ef4444';
          const roster = teamProfiles[idx] || [];
          return (
            <div key={idx} className={`flex-1 flex flex-col items-center justify-between p-4 ${idx === 0 ? 'border-r border-charcoal-700' : ''}`}>
              <div className="flex flex-col items-center gap-3">
                <p className="font-bold text-charcoal-200 text-lg text-center">{team?.team_name || `Team ${idx + 1}`}</p>
                {roster.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {roster.map(profile => (
                      <div key={profile.id} className="flex items-center gap-2 rounded-full border border-charcoal-700 bg-charcoal-800/60 px-2.5 py-1">
                        <UserAvatar
                          display_name={profile.display_name}
                          avatar_color={profile.avatar_color}
                          avatar_url={profile.avatar_url}
                          size="xs"
                        />
                        <span className="max-w-[72px] truncate text-xs font-bold text-charcoal-300">
                          {profile.display_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="font-black text-8xl font-mono" style={{ color }}>{scores[idx]}</div>
              {!isSpectator && !isTvDisplayMode && (match.status === 'active' || isAdmin) && (
                <div className="grid grid-cols-3 gap-2 w-full">
                  {[1, 2, 3].map(pts => (
                    <button
                      key={pts}
                      onClick={() => addPoints(idx as 0 | 1, pts as 1 | 2 | 3)}
                      className="score-btn-accent py-3 text-sm font-bold"
                      style={{ backgroundColor: `${color}30`, borderColor: `${color}50` }}
                    >
                      +{pts}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
